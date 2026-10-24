# Ponytail and Graphify

The user selected these exact repositories:

| Tool | Source used | Commit inspected | Role |
|---|---|---|---|
| Ponytail 5.3.2 | https://github.com/NipunThakuria02/ponytail | `16352ac229eb08a9598dcae48fe9f2b342567d86` | Coding/review guidance, particularly reusing the pipeline, avoiding an unnecessary database, and testing data boundaries. |
| Graphify 0.9.92 | https://github.com/NipunThakuria02/graphify | `86c57be8204673c2a1b9849a3292a7dd3ab373d8` | Local AST extraction and queries over the Python/TypeScript source. |

These are development tools, not dashboard dependencies or financial-chart libraries. No cloud Graphify subscription, model API key, Ponytail account, or agent lifecycle hooks are needed to run this site. No user machine installation is required for a hosted version.

Ponytail's `skills/ponytail/SKILL.md` was read and applied directly; no global configuration or hooks were changed. Graphify was installed from the selected checkout into a separate tooling environment at `/workspace/.stock-tools/graphify-venv`, keeping its dependencies out of the research environment. The temporary source checkouts were under `/tmp/stock-tools/`.

## Rebuild the code map in the prepared cloud machine

From `/workspace/STOCK`:

```sh
/workspace/.stock-tools/graphify-venv/bin/graphify extract . --code-only --max-workers 2 --no-cluster
/workspace/.stock-tools/graphify-venv/bin/graphify export html
/workspace/.stock-tools/graphify-venv/bin/graphify explain getResults
/workspace/.stock-tools/graphify-venv/bin/graphify path 'src/nse_forecast/cli.py::main()' 'results_payload()'
```

Generated artifacts live in the ignored `graphify-out/` folder. `graph.json` contains the graph; `graph.html` is an interactive source-code map. Code-only extraction deliberately excludes document semantics and needs no API call. CSS is not mapped by this mode. The graph correctly traces `main → export_results → results_payload` and links the React application to `getResults`. Use actual build/browser tests as evidence that the site works; a source graph alone cannot verify runtime behaviour.

On a separate machine, Graphify is optional. To reproduce the tool setup from the selected source without global installs:

```sh
git clone https://github.com/NipunThakuria02/graphify.git /tmp/graphify-source
git -C /tmp/graphify-source checkout 86c57be8204673c2a1b9849a3292a7dd3ab373d8
python -m venv .tools/graphify
.tools/graphify/bin/python -m pip install /tmp/graphify-source
.tools/graphify/bin/graphify extract . --code-only --max-workers 2 --no-cluster
.tools/graphify/bin/graphify export html
```
