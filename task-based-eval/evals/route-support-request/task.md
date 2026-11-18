# Route support requests

Use the supplied routing-guide.md to route every request in requests.json.
Return decisions.json as a JSON array, with exactly one object per request:

```json
{ "id": "the request ID", "route": "the chosen queue", "rule": "the applicable guide rule ID" }
```

Order does not matter. All requests must appear once. Follow the guide's precedence
when several conditions apply, and cite the selected rule. This task asks for
decisions only: do not send messages, submit tickets or claim an external action.
No package, SDK, implementation program or shell execution is needed to decide.
Read the provided materials and write the answer, with a brief observations.md
listing what you used, any uncertainty and any revisions.

Allowed materials: this task, requests.json and routing-guide.md in the staged
workspace. Allowed actions: reading those files and writing the two result files.
Keep the supplied files unchanged. Budget: six tool calls and three minutes.
