#!/usr/bin/env bash
URL="${MCP_URL:-http://localhost:8080/mcp}"
TOOL="$1"
ARGS="${2:-}"
if [ -z "$ARGS" ]; then ARGS='{}'; fi
AUTH=()
if [ -n "$MCP_KEY" ]; then AUTH=(-H "Authorization: Bearer $MCP_KEY"); fi
curl -s -X POST "$URL" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" "${AUTH[@]}" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}" | sed -n 's/^data: //p' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);if(r.error){console.log(JSON.stringify(r.error,null,2));return}const c=r.result;if(c.isError)console.log('TOOL ERROR');console.log(JSON.stringify(JSON.parse(c.content[0].text),null,2))})"