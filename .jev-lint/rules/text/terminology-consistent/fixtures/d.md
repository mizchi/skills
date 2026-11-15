---
name: project-workflow
description: "Use when carrying out this project workflow."
---

# Project Workflow

The GPU command queue submits GPU work. The background worker queue schedules CPU compilation tasks. Keep the worker queue independent from the GPU command queue.
