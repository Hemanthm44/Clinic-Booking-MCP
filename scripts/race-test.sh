#!/usr/bin/env bash
DOCTOR="${1:-Patel}"
START="${2:-2026-11-23T12:00}"
N="${3:-5}"
DIR=$(mktemp -d)
for i in $(seq 1 "$N"); do
  PHONE=$(printf '07700 9002%02d' "$i")
  ./scripts/mcp-call.sh confirm_booking "{\"doctor\":\"$DOCTOR\",\"start\":\"$START\",\"patient_name\":\"Race Caller $i\",\"phone\":\"$PHONE\",\"date_of_birth\":\"1990-01-01\"}" > "$DIR/$i.txt" &
done
wait
BOOKED=$(grep -l "You're booked" "$DIR"/*.txt | wc -l | tr -d ' ')
TAKEN=$(grep -l '"SLOT_TAKEN"' "$DIR"/*.txt | wc -l | tr -d ' ')
echo "Parallel bookings for $DOCTOR at $START: $N sent, $BOOKED booked, $TAKEN slot taken"
grep -h -E '"summary"|"code"' "$DIR"/*.txt
rm -rf "$DIR"
if [ "$BOOKED" = "1" ] && [ "$TAKEN" = "$((N - 1))" ]; then echo "RACE TEST PASSED"; else echo "RACE TEST FAILED"; fi