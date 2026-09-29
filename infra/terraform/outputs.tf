output "url" {
  description = "Dashboard URL."
  value       = local.use_cloudfront ? "https://${aws_cloudfront_distribution.main[0].domain_name}" : "https://${aws_lb.main.dns_name}"
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service" {
  value = aws_ecs_service.app.name
}

output "ingest_token_secret" {
  description = "Secrets Manager secret holding the upload token for CI."
  value       = aws_secretsmanager_secret.ingest_token.name
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN repository variable in GitHub."
  value       = local.github_enabled ? aws_iam_role.github_deploy[0].arn : null
}
