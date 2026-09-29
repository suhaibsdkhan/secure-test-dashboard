resource "aws_db_subnet_group" "main" {
  name       = var.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "postgres" {
  name   = "${var.name}-pg16"
  family = "postgres16"

  # Refuse unencrypted connections.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }
  parameter {
    name  = "log_connections"
    value = "1"
  }
}

# AWS-0176: the app authenticates with an RDS-managed, rotated password from Secrets Manager.
# AWS-0177: deletion protection is a variable so a throwaway demo can be destroyed; enable it for real data.
#trivy:ignore:AWS-0176
#trivy:ignore:AWS-0177
resource "aws_db_instance" "main" {
  identifier     = var.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = 20
  max_allocated_storage = 50
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "dashboard"
  username = "dashboard"
  # RDS generates the password, stores it in Secrets Manager and rotates it. It never
  # appears in Terraform state or in the task definition.
  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.db.id]
  parameter_group_name   = aws_db_parameter_group.postgres.name
  publicly_accessible    = false

  backup_retention_period    = 7
  auto_minor_version_upgrade = true
  deletion_protection        = var.db_deletion_protection
  skip_final_snapshot        = !var.db_deletion_protection
  final_snapshot_identifier  = var.db_deletion_protection ? "${var.name}-final" : null
  copy_tags_to_snapshot      = true

  performance_insights_enabled    = true
  enabled_cloudwatch_logs_exports = ["postgresql"]
}
