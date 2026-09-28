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

The production service runs in `us-west-2` behind API Gateway REST API and AWS WAF. Run `bash server/deploy-lambda.sh` after authenticating the AWS CLI to build and update the Python 3.12 x86_64 Lambda package. It writes the API Gateway URL into `fullhouse-config.js`; the API Gateway stage and WAF must already exist. When `dist/` exists it uses that directory; set `POKER_FRONTEND_DIR` to override the path.

Production resources:

- API Gateway REST API `riverlab-fullhouse-api`, API ID `lnupl1lrya`, stage `prod`, with `POST /decide`, `GET /health`, and CORS preflight routes.
- Regional WAF ACL `riverlab-fullhouse-waf`, attached to that stage. It blocks `/decide` request bodies above 16 KiB and limits a source IP to 300 `/decide` requests per five minutes.
- API Gateway throttles `/decide` at 2 requests per second with burst 5; Lambda has reserved concurrency 5 once the regional account quota allows it.
- DynamoDB table `riverlab-fullhouse-sessions`, keyed by `session_id`, with TTL on `expires_at`.
- Lambda accepts at most 5,000 valid AI decisions per UTC day; excess requests receive HTTP 429. The application also rejects `/decide` bodies above 64 KiB before parsing JSON.
- CloudWatch access logs record request IP, route, status, and user agent for seven days. Alarms watch 4,000 daily invocations, concurrency of 4, any execution error, and any Lambda throttle. AWS Budgets emails at $5, $8, and $10 of actual monthly account spend and when the forecast reaches $10.
- Lambda logs expire after seven days. Its memory remains 1 GB with a 30 second timeout.

The API Gateway URL is `https://lnupl1lrya.execute-api.us-west-2.amazonaws.com/prod`. The former public Lambda Function URL is disabled so it cannot bypass API Gateway and WAF. WAF has a fixed monthly charge for the web ACL and rules, in addition to per-request and API Gateway usage charges; the $10 budget is an alert, not a spending cap.

Override the region or resource names with `AWS_REGION`, `LAMBDA_FUNCTION_NAME`, `API_GATEWAY_NAME`, `API_GATEWAY_STAGE`, `SESSION_TABLE_NAME`, and `LAMBDA_ROLE_NAME` before running the script. The script does not create or modify the API Gateway or WAF resources.

## Session persistence

The browser creates a random AI session UUID in `sessionStorage` and sends the same ID with every AI decision in that tab. It also keeps the hand sequence in `sessionStorage`, so a page reload does not reuse a Fullhouse hand ID. DynamoDB stores Fullhouse's per-seat opponent statistics and action-log deduplication cursor, so Lambda cold starts and concurrent execution environments keep the same session history. A session expires after 12 hours without a decision. DynamoDB TTL deletion is asynchronous, while the service checks `expires_at` itself and ignores expired state immediately.

When `SESSION_TABLE_NAME` is unset, the API runs locally and keeps session statistics in process memory, matching the previous local development behavior. The browser falls back to its existing local strategy if the API is absent or unreachable, and shows a notice in the page footer.

## Data sent to the strategy

Each decision request contains only the acting AI's hole cards, public board, public player stacks and bets, legal-raise state, and the public action log. Other players' hole cards and the browser's seven-day training history are not sent. The adapter validates the request, calls Fullhouse, then maps the returned action and bet target to a legal game action.

All five AI opponents call Fullhouse Bot on every street. The adapter converts the browser state to Fullhouse's input format, calls `decide(game_state)`, and returns Fullhouse's chosen action and size to the game. The separate training-frequency display remains an approximation and is not a solver GTO chart.
