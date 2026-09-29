# AWS WAF in front of CloudFront: AWS managed rules for common web exploits and known-bad
# inputs, plus a per-IP rate limit. Roughly US$8/month; set enable_waf = false to skip.
# CloudFront-scoped web ACLs must live in us-east-1.

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      Project   = var.name
      ManagedBy = "terraform"
    }
  }
}

locals {
  waf_enabled = local.use_cloudfront && var.enable_waf
  managed_rule_groups = {
    AWSManagedRulesCommonRuleSet          = 10
    AWSManagedRulesKnownBadInputsRuleSet  = 20
    AWSManagedRulesAmazonIpReputationList = 30
  }
}

resource "aws_wafv2_web_acl" "main" {
  count    = local.waf_enabled ? 1 : 0
  provider = aws.us_east_1
  name     = var.name
  scope    = "CLOUDFRONT"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = local.managed_rule_groups
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        none {}
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key

          # JUnit reports are uploaded as XML bodies of up to a few MB; the common rule set's
          # 8 KB body-size rule would block every upload, so count it instead of blocking.
          dynamic "rule_action_override" {
            for_each = rule.key == "AWSManagedRulesCommonRuleSet" ? ["SizeRestrictions_BODY"] : []
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  rule {
    name     = "rate-limit-per-ip"
    priority = 100
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit-per-ip"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = var.name
    sampled_requests_enabled   = true
  }
}
