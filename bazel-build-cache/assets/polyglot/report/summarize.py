import json
import sys

with open(sys.argv[1]) as src:
    items = json.load(src)
total = sum(item["count"] for item in items)
with open(sys.argv[2], "w") as out:
    out.write(json.dumps({"items": len(items), "total": total}) + "\n")
