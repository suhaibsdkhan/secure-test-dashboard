# Deploying to AWS

Terraform in `infra/terraform` creates everything; GitHub Actions ships new versions.

```
Browser ──HTTPS──> CloudFront + WAF ──> ALB (CloudFront-only) ──> ECS Fargate (app) ──TLS──> RDS PostgreSQL
                                                                       │                     (private subnets)
                                                             Secrets Manager: DB password, upload token
```

**Cost**, roughly, in `ca-central-1`: RDS `db.t4g.micro` ~US$15/month, ALB ~$18, Fargate
(0.25 vCPU / 0.5 GB) ~$9, WAF ~$8, public IPv4 addresses ~$11, CloudFront and logs pennies
at demo traffic. About **US$60/month** while it's up, so `terraform destroy` when you're done showing it.
No NAT gateway is used, which saves ~$35.

## Prerequisites

- An AWS account and credentials for an admin-ish user (`aws configure` or SSO).
- Terraform ≥ 1.6, Docker, and the AWS CLI.

## First deploy

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # set github_repository to your owner/repo
terraform init

# 1. Create everything, with no tasks running yet (there's no image to run).
terraform apply -var desired_count=0

# 2. Build and push the first image.
REPO=$(terraform output -raw ecr_repository_url)
aws ecr get-login-password | docker login --username AWS --password-stdin "${REPO%/*}"
docker build -t "$REPO:bootstrap" ../..
docker push "$REPO:bootstrap"

# 3. Start the service.
terraform apply
terraform output url
```

The first CloudFront distribution takes a few minutes to become reachable.

## Continuous deployment

Set two **repository variables** in GitHub (Settings → Secrets and variables → Actions → Variables):

| Variable | Value |
|---|---|
| `AWS_DEPLOY_ROLE_ARN` | `terraform output -raw github_deploy_role_arn` |
| `AWS_REGION` | e.g. `ca-central-1` |

After that, every push to `main` that passes the **Security** workflow builds the image,
pushes it to ECR tagged with the commit SHA (tags are immutable), and rolls the ECS
service. ECS's deployment circuit breaker rolls back automatically if the new tasks fail
their health checks. The deploy role can only be assumed from `main` of the configured repo.

Optionally create a `production` environment in GitHub with required reviewers to add a
manual approval before each deploy.

## Your own domain

Request an ACM certificate for your domain in the same region, then set
`certificate_arn` in `terraform.tfvars`. CloudFront is removed, the ALB serves HTTPS
(TLS 1.2+/1.3 policy) and redirects HTTP; point a DNS CNAME at the ALB.

## Tear down

```bash
terraform destroy
```

With `db_deletion_protection = false` (the default) this deletes the database without a
final snapshot.
