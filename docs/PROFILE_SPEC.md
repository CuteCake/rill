# Dialect Profile Specification (v1)

A **dialect profile** teaches Rill (the MLIR visualizer) how to display a
dialect it doesn't know: which ops matter in the dataflow graph, which are
noise, how regions should be handled, what an op is *doing* (e.g. "this
`linalg.generic` is a ReLU"), and what colors to use.

A profile is a single **JSON file** loaded via the **⚙ Profile** button in the
app header. No code — only declarative rules. It stacks *on top of* the
built-in profiles, so you only describe what's new about your dialect.

> **Generating a profile with an AI assistant**: paste this entire document
> plus a representative MLIR dump into your assistant and ask it to produce a
> profile JSON. Load the result in the app. If it's rejected, paste the
> validation errors back to the assistant. Then enable **Profile debug** in
> the sidebar and check, in the IR Explorer, which rule matched each op —
> paste any misclassifications back to the assistant and iterate.

## Top-level structure

```json
{
  "name": "my-npu",
  "version": 1,
  "dialects": { "npu": "#22d3ee" },
  "classify": [ ... ],
  "regions": [ ... ],
  "summarize": [ ... ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Short identifier shown in the sidebar Profiles list. |
| `version` | no | Spec version, currently `1`. |
| `description` | no | Free-text note about what the profile covers (JSON has no comments — put explanations here). |
| `dialects` | no | Map of dialect name → hex color for nodes/badges. |
| `classify` | no | Rules assigning each op a display class. |
| `regions` | no | Rules for how region-bearing ops are parsed. |
| `summarize` | no | Rules attaching purpose labels ("ReLU", "matmul", …). |
| `import` | no | Input-format import mapping (e.g. Caffe prototxt) — see [IMPORT_SPEC.md](IMPORT_SPEC.md). |

A machine-checkable JSON Schema for the whole profile format lives at
[schema/profile.schema.json](schema/profile.schema.json) — reference it from
your editor via `"$schema"` or hand it to an AI assistant alongside this doc.

All rule lists are evaluated **top to bottom; the first matching rule wins**,
and user profiles are consulted **before** built-in profiles. Put specific
rules before general ones. An op matched by no rule falls back to the
built-ins, then to defaults.

## Matchers

Every rule has a `match` object testing a single op. All fields present must
match (AND). Where a string is expected, an **array means "any of"**.
An empty/omitted `match` matches every op.

| Field | Type | Matches when |
|---|---|---|
| `opName` | string \| string[] | op name is exactly this (e.g. `"npu.dma_start"`). |
| `opNameRegex` | string \| string[] | op name matches the regex (implicitly anchored `^...$`). |
| `opNameContains` | string \| string[] | op name contains this substring. Loose — prefer `opName`. |
| `dialect` | string \| string[] | dialect (text before the first `.`) is exactly this. |
| `hasRegion` | boolean | op opens a `{ ... }` region. |
| `hasResults` | boolean | op produces SSA results (`%x = ...`). |
| `attrHas` | string \| string[] | the parsed attribute key exists (e.g. `"ins"`). |

## `classify` rules

Decide how an op appears in the dataflow graph view.

```json
"classify": [
  { "match": { "opName": "npu.barrier" }, "as": "structural" },
  { "match": { "opName": ["npu.dma_start", "npu.alloc"] }, "as": "aux" },
  { "match": { "dialect": "npu", "hasRegion": true }, "as": "container" }
]
```

`as` must be one of:

| Class | Effect |
|---|---|
| `compute` | Full-size node in the graph. **Default** for unmatched ops. |
| `aux` | Small "mini" node (constants, reshapes, fills…). Hidden entirely when the user toggles aux off; dataflow is traced *through* it either way. |
| `structural` | Never shown in the graph (modules, funcs, returns, plumbing). Dataflow is traced through it. |
| `container` | Region op whose children are graphed (currently displayed like `compute`). |

## `regions` rules

Decide what the parser does when an op opens a region (`{` at end of line).

```json
"regions": [
  { "match": { "opName": "npu.kernel" }, "policy": "opaque", "captureBody": true }
]
```

| Field | Values | Meaning |
|---|---|---|
| `policy` | `"opaque"` | Consume the region body inline: body ops do **not** become graph nodes; the op is one node. |
| | `"descend"` | Enter the region: body ops become children. **Default.** |
| `captureBody` | boolean | Only with `opaque`: keep the body lines and `iterator_types` on the op so `summarize` body conditions can inspect them (this is how `linalg.generic` works). Default `false`. |

## `summarize` rules

Attach a human-readable purpose label to ops — the graph shows the label in
place of the op name (with the op name as a sub-label), and the sidebar
aggregates counts under "Op Purposes".

```json
"summarize": [
  {
    "match": { "opName": "npu.kernel" },
    "when": {
      "bodyContainsAll": ["mulf", "addf"],
      "iteratorsInclude": "reduction"
    },
    "label": "matmul/MAC",
    "icon": "×+",
    "color": "#ef4444"
  },
  { "match": { "opName": "npu.kernel" }, "label": "kernel", "icon": "∘" }
]
```

| Field | Required | Meaning |
|---|---|---|
| `match` | no | Op matcher (see above). |
| `when` | no | Extra conditions on the op's captured region body. |
| `label` | yes | Short label, e.g. `"leaky ReLU"`. |
| `icon` | no | 1–2 char symbol shown before the label. |
| `color` | no | Hex badge/node color; defaults to the dialect color. |

`when` conditions (all present must hold). These inspect the region body
captured by a `regions` rule with `captureBody: true`:

| Field | Type | Meaning |
|---|---|---|
| `bodyContainsAll` | string[] | every listed op appears in the body |
| `bodyContainsAny` | string[] | at least one listed op appears |
| `bodyLacksAll` | string[] | none of the listed ops appear |
| `iteratorsInclude` | string | `iterator_types` contains this (e.g. `"reduction"`) |
| `iteratorsExclude` | string | `iterator_types` does not contain this |

Body op fragments match **op-name tokens, not substrings**: `"exp"` matches
`math.exp` but not `tensor.expand_shape`. Use a bare name (`"mulf"`) to match
any dialect, or a qualified one (`"arith.mulf"`) to be exact. Ordering
matters: put the most specific pattern first (e.g. sigmoid = `exp`+`divf`
must come before plain `exp`).

## Complete worked example

An imaginary `acc` accelerator dialect after lowering from linalg:

```json
{
  "name": "acc-accelerator",
  "version": 1,
  "dialects": {
    "acc": "#22d3ee",
    "acc_rt": "#a78bfa"
  },
  "classify": [
    { "match": { "opNameContains": "acc_rt." }, "as": "structural" },
    { "match": { "opName": ["acc.alloc", "acc.dealloc", "acc.dma"] }, "as": "aux" },
    { "match": { "opName": "acc.launch", "hasRegion": true }, "as": "compute" }
  ],
  "regions": [
    { "match": { "opName": "acc.launch" }, "policy": "opaque", "captureBody": true }
  ],
  "summarize": [
    {
      "match": { "opName": "acc.launch" },
      "when": { "bodyContainsAll": ["mulf", "addf"], "iteratorsInclude": "reduction" },
      "label": "matmul", "icon": "×+", "color": "#ef4444"
    },
    {
      "match": { "opName": "acc.launch" },
      "when": { "bodyContainsAny": ["maximumf", "maxf"] },
      "label": "ReLU", "icon": "↑", "color": "#f47316"
    },
    { "match": { "opName": "acc.launch" }, "label": "kernel", "icon": "▣" }
  ]
}
```

Reading of this profile: runtime plumbing (`acc_rt.*`) disappears from the
graph; allocation/DMA ops shrink to mini nodes; `acc.launch` regions are
swallowed into a single node whose body is pattern-matched into "matmul" /
"ReLU" / generic "kernel" labels with distinct colors.

## Reference: the built-in profile

The app ships with `builtin-core`
([src/extensions/profiles/builtin-core.json](../src/extensions/profiles/builtin-core.json)),
a standalone JSON file in exactly this format describing linalg/tensor/arith
and the IREE host dialects — read it as a second complete example or copy it
as a starting template. Your profile is
consulted first, so you can also *override* built-in behavior (e.g. re-show
`hal.*` ops by classifying them as `compute`).

## Debugging a profile

1. Load your `.mlir` file, then your profile JSON (⚙ Profile).
2. Validation errors appear in a red banner — they name the exact path and
   suggest corrections; paste them back to your AI assistant verbatim.
3. Enable **Profile debug** (sidebar, Profiles section). The IR Explorer
   then shows, on every op, which profile + rule index classified it
   (e.g. `aux · my-npu classify[1]`) and which summarize rule labeled it.
   `compute · default` means *no* rule matched and the fallback applied.
4. The sidebar Profiles section also counts ops that fell through to the
   default — a large number usually means your matchers misspell op names.

## Known limitations (v1)

- Dataflow edges come from SSA use-def only; symbol references
  (`@executable::@entry`) do not create edges yet.
- Ops with no SSA results never appear in the graph, so fully bufferized
  (memref/side-effect) IR produces an empty graph view.
- `classify: container` currently behaves like `compute`; scoped
  "view inside this region" navigation is planned.
