# @penelope/procedure-eval

Procedure replay harness for [Penelope](https://github.com/Mushisushi28/penelope).

Given a procedure definition + a recorded conversation thread, replays the procedure and computes a match score.

## Quick start

```bash
npm install @penelope/procedure-eval
```

```ts
import { createRecorder, replay } from "@penelope/procedure-eval";

const session = createRecorder(myAgentFn, { procedureId: "mobile-detail-v1", tenantId: "my-shop" });
await session.turn("Hey I want a full detail on my Civic");
const recording = session.finish("booked");

const result = await replay(procedure, recording, { passThreshold: 70 });
console.log(result.matchPercent, result.passed);
```

## CLI

```bash
penelope eval ./procedures/mobile-detail.json ./recordings/rec-001.json
penelope eval ./procedures/mobile-detail.json ./recordings/rec-001.json --threshold 80 --json
```

Exit code: `0` pass, `1` fail or error.

## Match scoring

| Weight | Component |
|--------|-----------|
| 50% | Field coverage — expected fields extracted |
| 50% | Turn similarity — Jaccard token overlap |

## API

`replay(procedure, recording, opts?)` - returns `EvalResult` with `matchPercent`, `fieldDiffs`, `turnDiffs`, `passed`.

`createRecorder(agentFn, opts)` - returns session with `.turn()`, `.finish()`, `.save()`.

`loadRecording(filePath)` - load a Recording from JSON.

## License

MIT
