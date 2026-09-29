terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }

  # Local state by default. For a shared setup, create an S3 bucket and uncomment:
  # backend "s3" {
  #   bucket       = "my-tfstate-bucket"
  #   key          = "test-dashboard/terraform.tfstate"
  #   region       = "ca-central-1"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project   = var.name
      ManagedBy = "terraform"
    }
  }
}
