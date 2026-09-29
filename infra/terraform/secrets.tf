resource "random_password" "ingest_token" {
  length  = 48
  special = false
}

# Token CI jobs use to upload test reports. Read it with:
#   aws secretsmanager get-secret-value --secret-id <name>-ingest-token --query SecretString --output text
resource "aws_secretsmanager_secret" "ingest_token" {
  name                    = "${var.name}-ingest-token"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "ingest_token" {
  secret_id     = aws_secretsmanager_secret.ingest_token.id
  secret_string = random_password.ingest_token.result
}
