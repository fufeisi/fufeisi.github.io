"""AWS Lambda entry point for API Gateway REST API and Function URL events."""

from mangum import Mangum

from app import app


handler = Mangum(app, lifespan="off")
