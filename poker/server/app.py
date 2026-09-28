"""HTTP adapter for the original Fullhouse Bot v16 strategy."""

from __future__ import annotations

import importlib.util
import datetime as dt
import json
import logging
import os
import random
import threading
import time
import uuid
from collections import OrderedDict
from pathlib import Path
from typing import Annotated, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("riverlab.fullhouse")

VENDOR_BOT_PATH = Path(__file__).parent / "vendor" / "fullhouse_bot.py"
BOT_SPEC = importlib.util.spec_from_file_location("riverlab_fullhouse_original", VENDOR_BOT_PATH)
if BOT_SPEC is None or BOT_SPEC.loader is None:
    raise RuntimeError(f"Could not load Fullhouse Bot source from {VENDOR_BOT_PATH}")
fullhouse_bot = importlib.util.module_from_spec(BOT_SPEC)
BOT_SPEC.loader.exec_module(fullhouse_bot)
if not fullhouse_bot._HAVE_EVAL7:
    raise RuntimeError("eval7 is required for the original Fullhouse Bot equity engine")

BOT_LOCK = threading.RLock()
SESSION_LAST_SEEN: OrderedDict[str, float] = OrderedDict()
SESSION_TTL_SECONDS = 12 * 60 * 60
DAILY_DECISION_LIMIT = max(1, int(os.getenv("DAILY_DECISION_LIMIT", "20000")))
MAX_TRACKED_SESSIONS = 256
DYNAMODB_TABLE_NAME = os.getenv("SESSION_TABLE_NAME", "").strip()
_SESSION_TABLE = None

CardCode = Annotated[str, StringConstraints(pattern=r"^[2-9TJQKA][shdc]$")]
Street = Literal["preflop", "flop", "turn", "river"]
Action = Literal["small_blind", "big_blind", "fold", "check", "call", "bet", "raise", "all_in"]


class PlayerInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seat: int = Field(ge=0, le=5)
    chips: float = Field(ge=0, le=100_000)
    street_bet: float = Field(ge=0, le=100_000)
    folded: bool
    all_in: bool
    style: Literal["tight-passive", "tight-aggressive", "loose-passive", "loose-aggressive", "balanced"] = "balanced"


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seat: int = Field(ge=0, le=5)
    street: Street
    action: Action
    amount: float = Field(default=0, ge=0, le=100_000)
    target: float | None = Field(default=None, ge=0, le=100_000)


class DecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=36, max_length=36)
    hand_number: int = Field(ge=1, le=2_000_000_000)
    seat_to_act: int = Field(ge=0, le=5)
    street: Street
    your_cards: list[CardCode] = Field(min_length=2, max_length=2)
    community_cards: list[CardCode] = Field(max_length=5)
    current_bet: float = Field(ge=0, le=100_000)
    min_raise: float = Field(gt=0, le=100_000)
    pot: float = Field(ge=0, le=1_000_000)
    can_raise: bool
    players: list[PlayerInput] = Field(min_length=6, max_length=6)
    action_log: list[ActionInput] = Field(max_length=200)

    @model_validator(mode="after")
    def validate_table(self) -> "DecisionRequest":
        try:
            uuid.UUID(self.session_id)
        except ValueError as exc:
            raise ValueError("session_id must be a UUID") from exc

        if sorted(player.seat for player in self.players) != list(range(6)):
            raise ValueError("players must contain each seat from 0 through 5")
        if self.seat_to_act not in {player.seat for player in self.players}:
            raise ValueError("seat_to_act must be a player at the table")
        actor = next(player for player in self.players if player.seat == self.seat_to_act)
        if actor.folded or actor.all_in or actor.chips <= 0:
            raise ValueError("the acting seat must be able to act")

        known_cards = self.your_cards + self.community_cards
        if len(set(known_cards)) != len(known_cards):
            raise ValueError("hole cards and board cards must be unique")
        expected_board_size = {"preflop": 0, "flop": 3, "turn": 4, "river": 5}[self.street]
        if len(self.community_cards) != expected_board_size:
            raise ValueError("board size does not match the current street")
        return self


class DecisionResponse(BaseModel):
    action: Literal["fold", "check", "call", "bet", "raise"]
    target: float | None = None
    bot: str


def _forget_session(session_id: str) -> None:
    prefix = f"{session_id}:"
    for bot_id in [key for key in fullhouse_bot.PLAYER_STATS if key.startswith(prefix)]:
        fullhouse_bot.PLAYER_STATS.pop(bot_id, None)
    for hand_id in [key for key in fullhouse_bot._APPLIED if key.startswith(prefix)]:
        fullhouse_bot._APPLIED.pop(hand_id, None)


def _touch_session(session_id: str) -> None:
    now = time.monotonic()
    expired = [key for key, seen in SESSION_LAST_SEEN.items() if now - seen > SESSION_TTL_SECONDS]
    for key in expired:
        SESSION_LAST_SEEN.pop(key, None)
        _forget_session(key)

    SESSION_LAST_SEEN[session_id] = now
    SESSION_LAST_SEEN.move_to_end(session_id)
    while len(SESSION_LAST_SEEN) > MAX_TRACKED_SESSIONS:
        oldest, _ = SESSION_LAST_SEEN.popitem(last=False)
        _forget_session(oldest)


def _get_session_table():
    """Create the DynamoDB table handle only when persistent storage is enabled."""
    global _SESSION_TABLE
    if _SESSION_TABLE is None:
        import boto3

        _SESSION_TABLE = boto3.resource("dynamodb").Table(DYNAMODB_TABLE_NAME)
    return _SESSION_TABLE


def _load_persistent_state(table, session_id: str) -> tuple[int, dict, dict]:
    result = table.get_item(Key={"session_id": session_id}, ConsistentRead=True)
    item = result.get("Item")
    if not item:
        return 0, {}, {}

    version = int(item.get("version", 0))
    if int(item.get("expires_at", 0)) <= int(time.time()):
        # TTL deletion is asynchronous; treat expired items as absent immediately.
        return version, {}, {}

    try:
        state = json.loads(item.get("state", "{}"))
    except (TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("Stored Fullhouse session state is invalid") from exc
    player_stats = state.get("player_stats", {})
    applied = state.get("applied", {})
    if not isinstance(player_stats, dict) or not isinstance(applied, dict):
        raise RuntimeError("Stored Fullhouse session state has an invalid shape")
    return version, player_stats, applied


def _consume_daily_quota(table) -> None:
    """Cap public Function URL invocations to bound runaway compute spend."""
    today = dt.datetime.now(dt.timezone.utc).date()
    quota_key = f"__daily_quota__:{today.isoformat()}"
    expires_at = int(dt.datetime.combine(today + dt.timedelta(days=2), dt.time(), dt.timezone.utc).timestamp())
    try:
        table.update_item(
            Key={"session_id": quota_key},
            UpdateExpression="SET #expires = :expires ADD #count :one",
            ConditionExpression="attribute_not_exists(#count) OR #count < :limit",
            ExpressionAttributeNames={"#expires": "expires_at", "#count": "request_count"},
            ExpressionAttributeValues={
                ":expires": expires_at,
                ":one": 1,
                ":limit": DAILY_DECISION_LIMIT,
            },
        )
    except Exception as exc:
        error = getattr(exc, "response", {}).get("Error", {})
        if error.get("Code") == "ConditionalCheckFailedException":
            raise HTTPException(status_code=429, detail="Daily AI request limit reached") from exc
        raise


def _restore_persistent_state(session_id: str, player_stats: dict, applied: dict) -> None:
    _forget_session(session_id)
    prefix = f"{session_id}:"
    for bot_id, stats in player_stats.items():
        if isinstance(bot_id, str) and bot_id.startswith(prefix) and isinstance(stats, dict):
            fullhouse_bot.PLAYER_STATS[bot_id] = stats
    for hand_id, count in applied.items():
        if isinstance(hand_id, str) and hand_id.startswith(prefix):
            try:
                fullhouse_bot._APPLIED[hand_id] = int(count)
            except (TypeError, ValueError):
                continue


def _save_persistent_state(table, session_id: str, version: int) -> bool:
    prefix = f"{session_id}:"
    state = {
        "player_stats": {
            key: value for key, value in fullhouse_bot.PLAYER_STATS.items()
            if key.startswith(prefix)
        },
        "applied": {
            key: value for key, value in fullhouse_bot._APPLIED.items()
            if key.startswith(prefix)
        },
    }
    encoded = json.dumps(state, separators=(",", ":"), ensure_ascii=True)
    if len(encoded.encode("utf-8")) > 350 * 1024:
        raise RuntimeError("Fullhouse session state exceeds the safe DynamoDB item limit")

    item = {
        "session_id": session_id,
        "version": version + 1,
        "expires_at": int(time.time()) + SESSION_TTL_SECONDS,
        "state": encoded,
    }
    try:
        if version == 0:
            table.put_item(
                Item=item,
                ConditionExpression="attribute_not_exists(session_id)",
            )
        else:
            table.put_item(
                Item=item,
                ConditionExpression="#version = :expected",
                ExpressionAttributeNames={"#version": "version"},
                ExpressionAttributeValues={":expected": version},
            )
    except Exception as exc:
        error = getattr(exc, "response", {}).get("Error", {})
        if error.get("Code") == "ConditionalCheckFailedException":
            return False
        raise
    return True


def _apply_style_bias(raw_action: dict, game_state: dict, request: DecisionRequest) -> dict:
    """Apply the small style nudge selected for this AI at the start of the hand."""
    actor = next(player for player in request.players if player.seat == request.seat_to_act)
    profiles = {
        "tight-passive": (0.08, -0.16),
        "tight-aggressive": (0.08, 0.18),
        "loose-passive": (-0.07, -0.14),
        "loose-aggressive": (-0.07, 0.22),
        "balanced": (0.0, 0.0),
    }
    tightness, aggression = profiles.get(actor.style, (0.0, 0.0))
    action = str(raw_action.get("action", "fold")).lower() if isinstance(raw_action, dict) else "fold"
    owed = max(0.0, request.current_bet - actor.street_bet)

    if tightness > 0 and action == "call" and random.random() < tightness * 0.9:
        return {"action": "fold"}
    if tightness < 0 and action == "fold" and owed > 0 and owed <= request.pot * 0.2:
        if random.random() < abs(tightness) * 0.85:
            return {"action": "call"}

    if aggression > 0 and action in {"check", "call"} and request.can_raise:
        if random.random() < aggression * 0.5:
            cap = actor.street_bet + actor.chips
            minimum = float(game_state["min_raise_to"])
            target = request.current_bet + max(request.min_raise, request.pot * 0.5)
            target = min(cap, max(minimum, target))
            return {"action": "all_in" if target >= cap else ("raise" if request.current_bet > 0 else "bet"), "amount": target}
    elif aggression < 0 and action in {"raise", "all_in"}:
        if random.random() < abs(aggression) * 0.4:
            return {"action": "call" if owed > 0 else "check"}

    return raw_action


def _decide_with_session_state(game_state: dict, request: DecisionRequest) -> dict:
    session_id = request.session_id
    if not DYNAMODB_TABLE_NAME:
        _touch_session(session_id)
        return _apply_style_bias(fullhouse_bot.decide(game_state), game_state, request)

    table = _get_session_table()
    _consume_daily_quota(table)
    # Optimistic versioning prevents two overlapping requests for one browser
    # session from silently overwriting each other's opponent statistics.
    for _ in range(4):
        version, player_stats, applied = _load_persistent_state(table, session_id)
        _restore_persistent_state(session_id, player_stats, applied)
        fullhouse_bot.LAST_READ.clear()
        raw_action = _apply_style_bias(fullhouse_bot.decide(game_state), game_state, request)
        if _save_persistent_state(table, session_id, version):
            return raw_action

    raise HTTPException(status_code=503, detail="Session state changed concurrently; retry this action")


def _adapt_to_fullhouse(request: DecisionRequest) -> dict:
    players_by_seat = {player.seat: player for player in request.players}
    actor = players_by_seat[request.seat_to_act]
    fullhouse_players = []
    for player in request.players:
        fullhouse_players.append({
            "seat": player.seat,
            "bot_id": f"{request.session_id}:{player.seat}",
            "stack": player.chips,
            "bet_this_street": player.street_bet,
            "is_folded": player.folded,
            "state": "all_in" if player.all_in else "active",
        })

    # The bot reconstructs the hand from the action log. For raises the original
    # engine uses `amount` as the total street contribution, so provide target.
    fullhouse_log = []
    for event in request.action_log:
        action = "raise" if event.action == "bet" else event.action
        amount = event.amount
        if action in {"raise", "all_in"} and event.target is not None:
            amount = event.target
        fullhouse_log.append({"seat": event.seat, "action": action, "amount": amount})

    return {
        "hand_id": f"{request.session_id}:{request.hand_number}",
        "seat_to_act": request.seat_to_act,
        "num_players": 6,
        "street": request.street,
        "your_cards": request.your_cards,
        "community_cards": request.community_cards,
        "current_bet": request.current_bet,
        "amount_owed": max(0.0, request.current_bet - actor.street_bet),
        "your_stack": actor.chips,
        "your_bet_this_street": actor.street_bet,
        "min_raise_to": request.current_bet + request.min_raise if request.current_bet > 0 else request.min_raise,
        "pot": request.pot,
        "can_check": request.current_bet <= actor.street_bet + 0.001,
        "can_raise": request.can_raise,
        "players": fullhouse_players,
        "action_log": fullhouse_log,
    }


def _make_legal_response(raw: object, game_state: dict, request: DecisionRequest) -> DecisionResponse:
    if not isinstance(raw, dict):
        raise HTTPException(status_code=502, detail="Fullhouse returned an invalid action")

    action = str(raw.get("action", "fold")).lower()
    actor = next(player for player in request.players if player.seat == request.seat_to_act)
    owed = max(0.0, request.current_bet - actor.street_bet)
    cap = actor.street_bet + actor.chips
    if action in {"raise", "all_in"}:
        if not request.can_raise:
            action = "call" if owed > 0.001 else "check"
        else:
            original_action = action
            minimum = float(game_state["min_raise_to"])
            if cap < minimum and original_action != "all_in":
                action = "call" if owed > 0.001 else "check"
                target = None
            else:
                target = cap if original_action == "all_in" else raw.get("amount")
            try:
                target = float(target) if target is not None else None
            except (TypeError, ValueError):
                target = minimum
            if target is not None:
                target = min(cap, max(minimum, target))
                action = "raise" if request.current_bet > 0 else "bet"
                return DecisionResponse(action=action, target=target, bot=fullhouse_bot.BOT_NAME)

    if action == "call" and owed <= 0.001:
        action = "check"
    elif action == "check" and owed > 0.001:
        action = "fold"
    if action not in {"fold", "check", "call"}:
        action = "fold"
    return DecisionResponse(action=action, bot=fullhouse_bot.BOT_NAME)


configured_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://fufeisi.github.io,http://localhost:8000,http://127.0.0.1:8000",
    ).split(",")
    if origin.strip()
]

app = FastAPI(title="River Lab Fullhouse Bot API", version="1.0.0")
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=configured_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "bot": fullhouse_bot.BOT_NAME,
        "eval7": bool(fullhouse_bot._HAVE_EVAL7),
        "session_storage": "dynamodb" if DYNAMODB_TABLE_NAME else "memory",
    }


@app.post("/decide", response_model=DecisionResponse)
def decide(payload: DecisionRequest, http_request: Request) -> DecisionResponse:
    content_length = http_request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > 64 * 1024:
                raise HTTPException(status_code=413, detail="Request is too large")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid content length") from exc

    game_state = _adapt_to_fullhouse(payload)
    with BOT_LOCK:
        try:
            raw_action = _decide_with_session_state(game_state, payload)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Fullhouse decision or session persistence failed")
            status = 503 if DYNAMODB_TABLE_NAME else 500
            raise HTTPException(status_code=status, detail="Fullhouse decision failed")
    return _make_legal_response(raw_action, game_state, payload)
