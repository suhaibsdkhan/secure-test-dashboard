variable "name" {
  description = "Prefix for all resource names."
  type        = string
  default     = "test-dashboard"
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "ca-central-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "image_tag" {
  description = "Tag of the app image in ECR to run. CI deploys new tags directly to ECS after the first apply."
  type        = string
  default     = "bootstrap"
}

variable "desired_count" {
  description = "Number of app tasks. Set to 0 for the first apply, before any image has been pushed."
  type        = number
  default     = 1
}

variable "certificate_arn" {
  description = "ACM certificate ARN for your own domain; the load balancer then terminates TLS. Empty = serve HTTPS through CloudFront's default domain."
  type        = string
  default     = ""
}

variable "allowed_cidrs" {
  description = "CIDRs allowed to reach the load balancer (own-certificate mode only)."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_deletion_protection" {
  description = "Protect the database from `terraform destroy`. Leave false for a throwaway demo."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "owner/repo allowed to deploy via GitHub Actions OIDC. Empty = don't create the deploy role."
  type        = string
  default     = ""
}

variable "create_github_oidc_provider" {
  description = "Create the account-wide GitHub OIDC provider. Set false if the account already has one."
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "Attach an AWS WAF web ACL to CloudFront (about US$8/month)."
  type        = bool
  default     = true
}
