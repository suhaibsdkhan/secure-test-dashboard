# HTTPS without owning a domain: CloudFront serves the app on its *.cloudfront.net name with
# AWS's certificate. The load balancer only accepts CloudFront's IP ranges, and only requests
# carrying a secret header CloudFront adds, so it can't be reached around CloudFront.
#
# With var.certificate_arn set (your own domain), CloudFront is skipped and the load balancer
# terminates TLS itself.

locals {
  use_cloudfront = var.certificate_arn == ""
}

resource "random_password" "origin_verify" {
  length  = 40
  special = false
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer" {
  name = "Managed-AllViewerExceptHostHeader"
}

# AWS-0010: access logging is off to keep the demo free of an extra S3 bucket; the app's
# own logs and the WAF's sampled requests cover debugging. Turn it on for production.
#trivy:ignore:AWS-0010
resource "aws_cloudfront_distribution" "main" {
  count           = local.use_cloudfront ? 1 : 0
  web_acl_id      = local.waf_enabled ? aws_wafv2_web_acl.main[0].arn : null
  enabled         = true
  comment         = var.name
  price_class     = "PriceClass_100"
  http_version    = "http2and3"
  is_ipv6_enabled = true

  origin {
    origin_id   = "alb"
    domain_name = aws_lb.main.dns_name
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # API and HTML: never cached, all viewer headers and query strings forwarded.
  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer.id
    compress                 = true
  }

  # Fingerprinted JS/CSS bundles are immutable, so cache them at the edge.
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    target_origin_id       = "alb"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = data.aws_cloudfront_cache_policy.optimized.id
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
