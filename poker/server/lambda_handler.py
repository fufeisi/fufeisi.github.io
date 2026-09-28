"""AWS Lambda entry point for a Lambda Function URL (HTTP API payload v2)."""

from mangum import Mangum

from app import app


handler = Mangum(app, lifespan="off")
