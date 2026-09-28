#!/usr/bin/env bash
set -euo pipefail

SERVER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SERVER_DIR/.." && pwd)"
if [[ -d "$REPO_DIR/dist" ]]; then
  DEFAULT_FRONTEND_DIR="$REPO_DIR/dist"
else
  DEFAULT_FRONTEND_DIR="$REPO_DIR"
fi
FRONTEND_DIR="${POKER_FRONTEND_DIR:-$DEFAULT_FRONTEND_DIR}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || true)}}"
REGION="${REGION:-us-west-2}"
FUNCTION_NAME="${LAMBDA_FUNCTION_NAME:-riverlab-fullhouse-bot}"
TABLE_NAME="${SESSION_TABLE_NAME:-riverlab-fullhouse-sessions}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-riverlab-fullhouse-lambda-role}"
BUILD_DIR="$SERVER_DIR/.lambda-build"
PACKAGE_DIR="$BUILD_DIR/package"

aws sts get-caller-identity --region "$REGION" >/dev/null
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text --region "$REGION")"
TABLE_ARN="arn:aws:dynamodb:${REGION}:${ACCOUNT_ID}:table/${TABLE_NAME}"

if ! aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws dynamodb create-table \
    --table-name "$TABLE_NAME" \
    --attribute-definitions AttributeName=session_id,AttributeType=S \
    --key-schema AttributeName=session_id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "$REGION" >/dev/null
fi
aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
TTL_STATUS="$(aws dynamodb describe-time-to-live --table-name "$TABLE_NAME" --query 'TimeToLiveDescription.TimeToLiveStatus' --output text --region "$REGION")"
if [[ "$TTL_STATUS" == "DISABLED" || "$TTL_STATUS" == "DISABLING" ]]; then
  aws dynamodb update-time-to-live \
    --table-name "$TABLE_NAME" \
    --time-to-live-specification Enabled=true,AttributeName=expires_at \
    --region "$REGION" >/dev/null
fi

TRUST_FILE="$BUILD_DIR/lambda-trust.json"
POLICY_FILE="$BUILD_DIR/lambda-session-policy.json"
mkdir -p "$BUILD_DIR"
cat > "$TRUST_FILE" <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "lambda.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
JSON
cat > "$POLICY_FILE" <<JSON
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"],
    "Resource": "$TABLE_ARN"
  }]
}
JSON

if ! aws iam get-role --role-name "$ROLE_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_FILE" \
    --region "$REGION" >/dev/null
fi
aws iam attach-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole \
  --region "$REGION" >/dev/null
aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name FullhouseSessionTableAccess \
  --policy-document "file://$POLICY_FILE" \
  --region "$REGION"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text --region "$REGION")"

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
python3 -m pip install \
  --disable-pip-version-check \
  --only-binary=:all: \
  --platform manylinux2014_x86_64 \
  --implementation cp \
  --python-version 3.12 \
  --abi cp312 \
  --target "$PACKAGE_DIR" \
  -r "$SERVER_DIR/requirements.txt"
cp "$SERVER_DIR/app.py" "$SERVER_DIR/lambda_handler.py" "$PACKAGE_DIR/"
cp -R "$SERVER_DIR/vendor" "$PACKAGE_DIR/vendor"
find "$PACKAGE_DIR" -type d -name __pycache__ -prune -exec rm -rf {} +
rm -f "$BUILD_DIR/function.zip"
(cd "$PACKAGE_DIR" && zip -qr "$BUILD_DIR/function.zip" .)

python3 - "$BUILD_DIR/environment.json" "$TABLE_NAME" <<'PY'
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump({"Variables": {
        "SESSION_TABLE_NAME": sys.argv[2],
        "DAILY_DECISION_LIMIT": "20000",
        "ALLOWED_ORIGINS": "https://fufeisi.github.io,http://localhost:8000,http://127.0.0.1:8000",
        "LOG_LEVEL": "INFO"
    }}, output)
PY

if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$BUILD_DIR/function.zip" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --runtime python3.12 \
    --handler lambda_handler.handler \
    --role "$ROLE_ARN" \
    --timeout 30 \
    --memory-size 1024 \
    --environment "file://$BUILD_DIR/environment.json" \
    --region "$REGION" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"
else
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime python3.12 \
    --handler lambda_handler.handler \
    --role "$ROLE_ARN" \
    --zip-file "fileb://$BUILD_DIR/function.zip" \
    --timeout 30 \
    --memory-size 1024 \
    --architectures x86_64 \
    --environment "file://$BUILD_DIR/environment.json" \
    --region "$REGION" >/dev/null
  aws lambda wait function-active-v2 --function-name "$FUNCTION_NAME" --region "$REGION"
fi
mkdir -p "$BUILD_DIR/logs"
if ! aws logs create-log-group --log-group-name "/aws/lambda/$FUNCTION_NAME" --region "$REGION" 2>"$BUILD_DIR/log-group-error.txt"; then
  if ! grep -q ResourceAlreadyExistsException "$BUILD_DIR/log-group-error.txt"; then
    cat "$BUILD_DIR/log-group-error.txt" >&2
    exit 1
  fi
fi
aws logs put-retention-policy \
  --log-group-name "/aws/lambda/$FUNCTION_NAME" \
  --retention-in-days 7 \
  --region "$REGION"

python3 - "$BUILD_DIR/function-url-cors.json" <<'PY'
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump({
        "AllowOrigins": ["https://fufeisi.github.io", "http://localhost:8000", "http://127.0.0.1:8000"],
        "AllowMethods": ["GET", "POST"],
        "AllowHeaders": ["content-type"],
        "MaxAge": 600
    }, output)
PY
if aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --region "$REGION" >/dev/null 2>&1; then
  aws lambda update-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors "file://$BUILD_DIR/function-url-cors.json" \
    --region "$REGION" >/dev/null
else
  aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --cors "file://$BUILD_DIR/function-url-cors.json" \
    --region "$REGION" >/dev/null
fi

add_permission_if_missing() {
  local statement_id="$1"
  shift
  if ! aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "$statement_id" \
    --principal '*' \
    --region "$REGION" "$@" 2>"$BUILD_DIR/$statement_id-error.txt"; then
    if ! grep -q ResourceConflictException "$BUILD_DIR/$statement_id-error.txt"; then
      cat "$BUILD_DIR/$statement_id-error.txt" >&2
      return 1
    fi
  fi
}
add_permission_if_missing FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --function-url-auth-type NONE
add_permission_if_missing FunctionURLInvokeFunctionAccess \
  --action lambda:InvokeFunction \
  --invoked-via-function-url

FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION_NAME" --query FunctionUrl --output text --region "$REGION")"
python3 - "$FRONTEND_DIR/fullhouse-config.js" "$FUNCTION_URL" <<'PY'
import json, sys
with open(sys.argv[1], "w", encoding="utf-8") as output:
    output.write("// Generated by server/deploy-lambda.sh.\n")
    output.write("window.FULLHOUSE_API_BASE = " + json.dumps(sys.argv[2]) + ";\n")
PY

echo "Deployed Lambda Function URL: $FUNCTION_URL"
echo "Frontend config updated: $FRONTEND_DIR/fullhouse-config.js"
