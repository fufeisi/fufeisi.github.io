# Fullhouse Bot API

This service runs the upstream `v16_squeeze_C_metacap` Python bot and adapts the browser game's state to its `decide(game_state)` input format. The upstream source is kept in `vendor/fullhouse_bot.py`; its MIT license is in `vendor/FULLHOUSE-MIT-LICENSE.txt`.

## Run locally

From this directory, start the API:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8010
```

The health endpoint is `http://localhost:8010/health`. In a second terminal, serve the directory containing `index.html` on `http://localhost:8000`:

```sh
cd <directory-with-index.html>
python3 -m http.server 8000
```

The default CORS list already allows this local page origin. Temporarily set `window.FULLHOUSE_API_BASE` in the `fullhouse-config.js` file beside `index.html` to `http://localhost:8010`.

## Run as a container

Build and run the API from this directory:

```sh
docker build -t riverlab-fullhouse-api .
docker run --rm -p 8080:8080 riverlab-fullhouse-api
```

The container listens on port `8080` and exposes `/health` as its health check. It runs one Uvicorn worker because the bot's opponent statistics are held in process memory.

## AWS deployment

The container runs in Amazon ECS Express Mode in `us-west-2`. It uses container port `8080`, health check path `/health`, one task, and one Uvicorn worker because bot statistics live in process memory. The live health endpoint is `https://ri-2691b3e948934dbfb9a62fdb9f3a51ea.ecs.us-west-2.on.aws/health`; `fullhouse-config.js` points the browser to the service base URL. CloudWatch logs are retained for seven days.

## State handling

The browser sends only the acting bot's two cards, the public board, player chip and street-bet counts, and the public action log. Other players' hole cards and the browser's persistent device history are not sent. A random per-tab session UUID keeps Fullhouse's opponent statistics separate between game sessions. Session statistics live in service memory and expire after 12 hours of inactivity or when the service restarts.

The five seats call the same upstream strategy code. The server applies a small adapter after `decide()` to translate Fullhouse's actions and chip targets into the browser engine's legal bet, raise, check, call, or fold actions.
