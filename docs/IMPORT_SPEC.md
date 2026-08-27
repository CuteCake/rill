# Import Mapping Specification (v1)

An **import mapping** teaches Rill how to read an input format other than
MLIR — currently **Caffe prototxt** (protobuf text format), including legacy
and custom Caffe variants. It is an optional `import` section inside a
normal profile JSON ([PROFILE_SPEC.md](PROFILE_SPEC.md)), so a **single
file** describes both how to *parse* a format and how to *display* it.
Loaded via the same **⚙ Profile** button; no code — only declarative rules.

> **Generating a mapping with an AI assistant**: paste this document, plus
> [PROFILE_SPEC.md](PROFILE_SPEC.md), plus a representative prototxt file of
> your variant into your assistant and ask it to produce one profile JSON
> (import mapping + colors + classify + summarize). Load the result via
> ⚙ Profile and open your file. If the profile is rejected, paste the red
> validation errors back verbatim. Then use **Profile debug** (sidebar) to
> check per-op classification and iterate. The machine-checkable contract is
> [schema/profile.schema.json](schema/profile.schema.json) — assistants can
> validate against it directly.

## How importing works

1. When a file is opened, profiles are consulted in order (your loaded
   profile first, then built-ins). The first whose `import.detect` claims
   the file — by extension, else by content regex — wins. No claim → the
   file is parsed as MLIR.
2. The file is parsed as **protobuf text format** (`key: value`,
   `key { ... }`, repeated keys, `#` comments) into a message tree. This
   syntax is fixed across all Caffe variants; **variants differ only in
   field names and layer vocabulary, which is exactly what the mapping
   configures.**
3. The mapping converts each layer message into a graph node: `outputs`
   blobs become produced values, `inputs` blobs become consumed values, and
   matching names form the dataflow edges.
4. The profile's ordinary `dialects` / `classify` / `summarize` sections
   then style the resulting ops (matched via `opName` / `dialect` /
   `attrHas` as usual).

The app ships with `builtin-caffe`
([src/extensions/profiles/caffe.json](../src/extensions/profiles/caffe.json))
which handles standard Caffe (`layer` lists), legacy V1 (`layers` lists,
`CONVOLUTION`-style enum types), and unknown custom layer types out of the
box — read it as the canonical worked example or copy it as a template.
Loading your own profile with an `import` section **overrides** it.

## The `import` section

```json
"import": {
  "format": "prototxt",
  "detect": {
    "extensions": ["prototxt", "pbtxt"],
    "contentRegex": "^\\s*layers?\\s*\\{"
  },
  "dialect": "caffe",
  "nodes": {
    "list": ["layer", "layers"],
    "name": "name",
    "type": "type",
    "inputs": "bottom",
    "outputs": "top",
    "drop": [ { "path": "include.phase", "equals": "TEST" } ]
  },
  "opName": {
    "prefix": "caffe.",
    "map": { "CONVOLUTION": "Convolution", "INNER_PRODUCT": "InnerProduct" }
  },
  "attrs": [ { "path": "convolution_param.num_output", "as": "num_output" } ],
  "collectParams": true,
  "display": [
    { "typeIn": ["Convolution"], "template": "{convolution_param.num_output}×{convolution_param.kernel_size*}" }
  ],
  "netInputs": true,
  "group": { "delimiter": "/" }
}
```

| Field | Required | Meaning |
|---|---|---|
| `format` | yes | Source syntax. Only `"prototxt"` (protobuf text format) in v1. |
| `detect.extensions` | no | File extensions (no dot) this importer claims. |
| `detect.contentRegex` | no | Multiline-tested regex to sniff files whose extension didn't match (e.g. `.txt`). |
| `dialect` | yes | Dialect assigned to every imported op — drives node colors and profile matchers. |
| `nodes.list` | yes | Candidate repeated-field names holding the layer list; the **first with entries wins** (covers `layer` vs legacy `layers`). |
| `nodes.name` | yes | Dotted field path to the layer's display name. |
| `nodes.type` | yes | Dotted field path to the layer's type (quoted string or bare enum). |
| `nodes.inputs` | yes | Dotted field path to consumed blob names (Caffe: `bottom`). |
| `nodes.outputs` | yes | Dotted field path to produced blob names (Caffe: `top`). |
| `nodes.drop` | no | `{ path, equals }` rules — drop a layer when the value at `path` equals `equals` (string-compared). Classic use: TEST-phase layers. |
| `opName.prefix` | no | Prepended to the mapped type; defaults to `dialect + "."`. |
| `opName.map` | no | Raw type → canonical name table (legacy enums like `CONVOLUTION` → `Convolution`), so classify/summarize rules are written once. **Unmapped types pass through unchanged** — unknown custom layers still graph. |
| `attrs` | no | Explicit extractions `{ path, as? }` into `op.attrs` (default `as` = last path segment). Enables `attrHas` matchers. Win over auto-collected params. |
| `collectParams` | no | Auto-hoist every scalar leaf of `*_param` child messages into attrs. **Default `true`** — this is why unseen variants are mostly self-describing. |
| `display` | no | First-match node subtitle templates (see below). |
| `netInputs` | no | Synthesize source nodes from top-level `input:` declarations, with shapes from `input_shape { dim ... }` blocks or legacy flat `input_dim:` quads. Default `true`. Nets using an `Input` *layer* instead need nothing — that's an ordinary layer. |
| `group` | no | Derive layout group boxes from layer names: `{ "delimiter": "/" }` groups `conv1/bn` + `conv1/scale` under `conv1`; `{ "regex": "..." }` uses capture group 1. Groups need ≥2 members to render. |

### Display templates

The rendered string is drawn on the node like a type annotation. Rules are
tried top to bottom per layer; a rule applies when the layer's (mapped) type
is in `typeIn` (omit for all types) **and every placeholder resolves** —
otherwise the next rule is tried, so put detailed templates before sparse
fallbacks.

- `{dotted.path}` — first value at that path (`{pooling_param.pool}` → `MAX`)
- `{dotted.path*}` — **all** values joined with `×` (repeated fields:
  `kernel_size: 4` twice → `4×4`; `{input_param.shape.dim*}` → `1×3×224×224`)

## What you do NOT configure (automatic invariants)

The importer enforces the graph contract in code — **do not** try to express
these in the mapping:

- **In-place layers** (`top` == `bottom`, e.g. ReLU/BatchNorm/Scale chains):
  produced values are automatically versioned internally so every value has
  exactly one producer and edges stay linear. Displayed names stay plain.
- **Duplicate definitions** of a blob by different layers: versioned the
  same way, with a warning banner.
- **Layers with no `outputs`** (e.g. `Silence`): get a synthetic sink value
  so they still render as terminal nodes.
- **Source line tracking**: every node remembers its `layer { ... }` line
  for Source-view highlighting.
- Parse errors don't abort: the importer maps whatever parsed and reports
  line-numbered warnings in a yellow banner.

## Worked example: a custom legacy variant

A hypothetical fork using a `nodes` list, `_`-separated stage names, enum
types, and a custom `blur_param` block:

```json
{
  "name": "oldnet-variant",
  "version": 1,
  "description": "Importer for OldNet fork prototxt (node list, STAGE_OP naming).",
  "import": {
    "format": "prototxt",
    "detect": { "extensions": ["oldnet", "prototxt"] },
    "dialect": "oldnet",
    "nodes": {
      "list": ["node", "nodes"],
      "name": "id", "type": "op", "inputs": "src", "outputs": "dst",
      "drop": [ { "path": "mode", "equals": "DEBUG" } ]
    },
    "opName": { "map": { "CONV": "Convolution", "GAUSS_BLUR": "Blur" } },
    "display": [ { "typeIn": ["Blur"], "template": "σ={blur_param.sigma}" } ],
    "group": { "regex": "^([a-z]+\\d+)_" }
  },
  "dialects": { "oldnet": "#22d3ee" },
  "classify": [
    { "match": { "opName": "oldnet.Blur" }, "as": "aux" }
  ],
  "summarize": [
    { "match": { "opName": "oldnet.Convolution" }, "label": "conv", "icon": "⊛" }
  ]
}
```

## Debugging an import mapping

1. Load your profile (⚙ Profile), then open your prototxt file.
2. Red banner = profile rejected; the errors name exact paths with
   "did you mean" hints — paste them back to your assistant verbatim.
3. Yellow banner = imported with warnings (syntax issues, redefined blobs,
   missing node list — the usual sign of a wrong `nodes.list` name).
4. Empty graph? Check that `nodes.outputs`/`nodes.inputs` name the right
   fields: edges come purely from matching produced/consumed blob names.
5. **Profile debug** (sidebar) shows which classify/summarize rule matched
   each imported op, exactly as for MLIR dialects.

## Known limitations (v1)

- No shape inference: intermediate tensor shapes aren't computed, only
  declared input shapes and per-layer `display` summaries are shown.
- One prototxt-family syntax (`format: "prototxt"`); other textual formats
  (ONNX text, TF GraphDef pbtxt) are candidates for future `format` values.
- Weights (`.caffemodel`, binary protobuf) are out of scope — Rill
  visualizes topology.
