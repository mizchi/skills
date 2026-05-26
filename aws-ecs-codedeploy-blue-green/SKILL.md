---
name: aws-ecs-codedeploy-blue-green
description: ECS blue/green deployment patterns. Recommends ALB-native weighted target groups as the simpler default; covers CodeDeploy as a reference for teams that already use it or need pipeline-integrated rollback. Use when choosing or debugging ECS blue/green infrastructure.
---

# AWS ECS Blue/Green Deployments

## Recommendation: ALB-Native Weighted Routing (Preferred)

CodeDeploy adds IAM roles, appspec.json wiring, and a separate control plane. For most ECS blue/green needs, **ALB weighted target groups** achieve the same result with less setup.

### How it works

Define two target groups (blue/green) and a single listener rule that splits traffic by weight:

```hcl
resource "aws_lb_target_group" "blue" {
  name        = "myapp-blue"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "green" {
  # identical to blue
  name = "myapp-green"
  # ...
}

resource "aws_lb_listener_rule" "weighted" {
  listener_arn = aws_lb_listener.main.arn
  priority     = 100

  condition {
    path_pattern { values = ["/*"] }
  }

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 100
      }
      target_group {
        arn    = aws_lb_target_group.green.arn
        weight = 0
      }
      stickiness {
        enabled  = true
        duration = 300  # keep users on the same TG during rollout
      }
    }
  }
}
```

### Traffic shift procedure

```bash
# Canary: send 10% to green
aws elbv2 modify-rule --rule-arn <rule-arn> \
  --actions '[{"Type":"forward","ForwardConfig":{"TargetGroups":[{"TargetGroupArn":"<blue-arn>","Weight":90},{"TargetGroupArn":"<green-arn>","Weight":10}]}}]'

# Full cutover
aws elbv2 modify-rule --rule-arn <rule-arn> \
  --actions '[{"Type":"forward","ForwardConfig":{"TargetGroups":[{"TargetGroupArn":"<blue-arn>","Weight":0},{"TargetGroupArn":"<green-arn>","Weight":100}]}}]'

# Rollback: flip back to blue
aws elbv2 modify-rule --rule-arn <rule-arn> \
  --actions '[{"Type":"forward","ForwardConfig":{"TargetGroups":[{"TargetGroupArn":"<blue-arn>","Weight":100},{"TargetGroupArn":"<green-arn>","Weight":0}]}}]'
```

Or update weights via Terraform and apply. No appspec, no CodeDeploy IAM role, no separate control plane.

### When to use CodeDeploy instead

- Your team already has a CodeDeploy pipeline and wants to keep it
- You need automatic rollback triggered by CloudWatch alarms *without* custom scripts
- You need hooks (BeforeInstall, AfterInstall, AfterAllowTraffic) for migration/smoke steps

---

## CodeDeploy ECS Blue/Green (Reference)

### The Critical Non-Obvious Part: `lifecycle.ignore_changes`

When using CodeDeploy to manage ECS blue/green deployments, CodeDeploy **dynamically swaps the ALB listener's `default_action.target_group_arn`** between the blue and green target groups. If you don't suppress this in OpenTofu/Terraform, every subsequent `tofu plan` will show drift and try to restore the original target group — fighting with CodeDeploy on every deployment.

**Fix: always add `lifecycle.ignore_changes` to the listener:**

```hcl
resource "aws_lb_listener" "bg_demo" {
  load_balancer_arn = aws_lb.main.arn
  port              = 8080
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.bg_demo_blue.arn  # initial state only
  }

  # CodeDeploy swaps default_action.target_group_arn between blue and green.
  # Without this, tofu plan constantly shows drift.
  lifecycle {
    ignore_changes = [default_action]
  }
}
```

### Full Pattern

#### Two Target Groups (blue and green)

```hcl
resource "aws_lb_target_group" "bg_demo_blue" {
  name        = "myapp-blue"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    path                = "/health"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 10  # short for faster deployments
}

resource "aws_lb_target_group" "bg_demo_green" {
  # identical to blue
  name = "myapp-green"
  # ...
}
```

#### CodeDeploy App + Deployment Group

```hcl
resource "aws_iam_role" "codedeploy_ecs" {
  name = "myapp-codedeploy-ecs"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "codedeploy.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "codedeploy_ecs" {
  role       = aws_iam_role.codedeploy_ecs.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodeDeployRoleForECS"
}

resource "aws_codedeploy_app" "app" {
  compute_platform = "ECS"
  name             = "myapp"
}

resource "aws_codedeploy_deployment_group" "app" {
  app_name              = aws_codedeploy_app.app.name
  deployment_group_name = "myapp-dg"
  service_role_arn      = aws_iam_role.codedeploy_ecs.arn

  deployment_style {
    deployment_option = "WITH_TRAFFIC_CONTROL"
    deployment_type   = "BLUE_GREEN"
  }

  blue_green_deployment_config {
    deployment_ready_option {
      action_on_timeout = "CONTINUE_DEPLOYMENT"  # auto-shift, no manual confirmation
    }
    terminate_blue_instances_on_deployment_success {
      action                           = "TERMINATE"
      termination_wait_time_in_minutes = 5  # give blue tasks 5 min to finish in-flight requests
    }
  }

  # Traffic shift configs:
  # CodeDeployDefault.ECSCanary10Percent5Minutes  — 10% for 5 min, then 100%
  # CodeDeployDefault.ECSLinear10PercentEvery1Minutes — 10% per minute (10 min total)
  # CodeDeployDefault.ECSAllAtOnce               — immediate 100%
  deployment_config_name = "CodeDeployDefault.ECSCanary10Percent5Minutes"

  ecs_service {
    cluster_name = aws_ecs_cluster.main.name
    service_name = aws_ecs_service.app.name
  }

  load_balancer_info {
    target_group_pair_info {
      prod_traffic_route {
        listener_arns = [aws_lb_listener.bg_demo.arn]  # listener ARN, not rule ARN
      }
      target_group { name = aws_lb_target_group.bg_demo_blue.name }
      target_group { name = aws_lb_target_group.bg_demo_green.name }
    }
  }

  auto_rollback_configuration {
    enabled = true
    events  = ["DEPLOYMENT_FAILURE", "DEPLOYMENT_STOP_ON_ALARM"]
  }

  alarm_configuration {
    enabled = true
    alarms  = [aws_cloudwatch_metric_alarm.blue_5xx.alarm_name, aws_cloudwatch_metric_alarm.green_5xx.alarm_name]
  }
}
```

#### CloudWatch Alarms for Auto-Rollback

When `DEPLOYMENT_STOP_ON_ALARM` is set, CodeDeploy monitors these alarms during the canary phase. If any alarm fires, the deployment stops and rolls back.

```hcl
resource "aws_cloudwatch_metric_alarm" "blue_5xx" {
  alarm_name          = "myapp-blue-5xx"
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 1
  threshold           = 1   # production: use 5-10 to reduce false positives
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.main.arn_suffix
    TargetGroup  = aws_lb_target_group.bg_demo_blue.arn_suffix
  }
}

# identical for green
```

### Deployment Trigger (appspec.json)

CodeDeploy needs an `appspec.json` that points to the new task definition. This is passed at deploy time, not managed by Terraform:

```json
{
  "version": 1,
  "Resources": [{
    "TargetService": {
      "Type": "AWS::ECS::Service",
      "Properties": {
        "TaskDefinition": "<NEW_TASK_DEF_ARN>",
        "LoadBalancerInfo": {
          "ContainerName": "app",
          "ContainerPort": 8080
        }
      }
    }
  }]
}
```

```bash
aws deploy create-deployment \
  --application-name myapp \
  --deployment-group-name myapp-dg \
  --revision revisionType=AppSpecContent,appSpecContent={content="$(cat appspec.json)"}
```

### Common Pitfalls

- **`prod_traffic_route.listener_arns` must be a listener ARN, not a listener rule ARN.** Using a rule ARN here causes CodeDeploy to fail silently or with a confusing error.
- **Both blue and green target groups must have identical health check configuration.** Mismatched `healthy_threshold` / `unhealthy_threshold` values will cause one TG to always be considered unhealthy.
- **`desired_count` on `aws_ecs_service` should not change during blue/green.** CodeDeploy manages task counts independently during deployment.
- **CloudWatch alarm threshold for production**: use 5–10 for `threshold`, not 1. A single stray 5xx during the canary window will trigger a rollback on production load.
