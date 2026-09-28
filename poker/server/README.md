# Fullhouse Bot API

This service runs the original Fullhouse Bot v16 strategy in `vendor/fullhouse_bot.py` and adapts the browser game's state to its `decide(game_state)` input format. The upstream source and MIT license are included in `vendor/`.

## Run locally

From this directory, start the API:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload --port 8010
```

The health endpoint is `http://localhost:8010/health`. The page allows this local origin. For local development, set `window.FULLHOUSE_API_BASE` in `dist/fullhouse-config.js` to `http://localhost:8010`.

## Deploy to AWS Lambda

Run `bash server/deploy-lambda.sh` after authenticating the AWS CLI. The script builds a Python 3.12 x86_64 deployment ZIP, creates or updates these resources in `us-west-2` by default, and writes the resulting Function URL into `fullhouse-config.js` in the frontend directory. When `dist/` exists it uses that directory; set `POKER_FRONTEND_DIR` to override the path.

- Lambda Function URL with public `NONE` auth so the GitHub Pages client can call it directly.
- On-demand DynamoDB table `riverlab-fullhouse-sessions`, keyed by `session_id`, with TTL on `expires_at`.
- Lambda execution role with table read, write, and daily quota permissions.
- Seven day CloudWatch log retention, 1 GB Lambda memory, and 30 second timeout.

The public endpoint accepts at most 20,000 AI decisions per UTC day; excess requests receive HTTP 429. CORS is configured for `https://fufeisi.github.io` and localhost development. CORS is not authentication: anyone who obtains the URL can call it, so keep the quota in place. The Lambda account concurrency limit also applies.

Override the region or resource names with `AWS_REGION`, `LAMBDA_FUNCTION_NAME`, `SESSION_TABLE_NAME`, and `LAMBDA_ROLE_NAME` before running the script.

## Session persistence

The browser creates a random AI session UUID in `sessionStorage` and sends the same ID with every AI decision in that tab. It also keeps the hand sequence in `sessionStorage`, so a page reload does not reuse a Fullhouse hand ID. DynamoDB stores Fullhouse's per-seat opponent statistics and action-log deduplication cursor, so Lambda cold starts and concurrent execution environments keep the same session history. A session expires after 12 hours without a decision. DynamoDB TTL deletion is asynchronous, while the service checks `expires_at` itself and ignores expired state immediately.

When `SESSION_TABLE_NAME` is unset, the API runs locally and keeps session statistics in process memory, matching the previous local development behavior. The browser falls back to its existing local strategy if the Function URL is absent or unreachable, and shows a notice in the page footer.

## Data sent to the strategy

Each decision request contains only the acting AI's hole cards, public board, public player stacks and bets, legal-raise state, and the public action log. Other players' hole cards and the browser's seven-day training history are not sent. The adapter validates the request, calls Fullhouse, then maps the returned action and bet target to a legal game action.

All five AI opponents use the original Fullhouse Bot decision directly on every street, including its built-in preflop ranges and postflop decisions. The frontend does not send persona settings or modify the returned action. The separate training-frequency display remains an approximation and is not a solver GTO chart.
