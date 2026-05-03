# honyaku.dev Automatic Translation GitHub Action

A GitHub Action that automatically translates files using the [honyaku.dev](https://honyaku.dev) API. It uploads your
source file, translates it into multiple target languages using AI, and commits the results back to your repository.

## Features

- Supports 180+ languages
- Incremental translation using a lock file (`honyaku-lock.json`) to track analysis history
- Automatically commits and pushes translated files
- Custom prompts for fine-tuning translation output

## Usage

```yaml
- uses: honyaku-dev/honyaku-action@v0
  with:
    source-file: "en.json"
    output-dir: "lang"
    targets: "ja:ja.json, zh:zh.json, ko:ko.json"
    api-key: ${{ secrets.HONYAKU_API_KEY }}
```

You can also use `all` to target every available locale, combined with `{id}` or `{ID}` placeholders in the filename:

```yaml
- uses: honyaku-dev/honyaku-action@v0
  with:
    source-file: "en.json"
    output-dir: "lang"
    targets: "all:{id}.json"
    api-key: ${{ secrets.HONYAKU_API_KEY }}
```

## Inputs

| Name            | Required | Default                      | Description                                                                                                                                                                                         |
|-----------------|----------|------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `source-file`   | Yes      |                              | Path to the source translation file                                                                                                                                                                 |
| `output-dir`    | Yes      |                              | Output directory for translated files                                                                                                                                                               |
| `targets`       | Yes      |                              | Comma-separated list of target locales in the format `<locale>:<filename>`. Use `all` to target every locale. Filenames support `{id}` and `{ID}` placeholders (e.g. `all:{id}.json`, `ja:ja.json`) |
| `api-key`       | Yes      |                              | API key for authentication (get one at [honyaku.dev](https://honyaku.dev))                                                                                                                          |
| `custom-prompt` | No       | `""`                         | Custom prompt for the translator                                                                                                                                                                    |
| `base-url`      | No       | `https://honyaku.dev/api/v1` | Base URL of the Honyaku API                                                                                                                                                                         |

## Example Workflow

```yaml
name: Translate

on:
  push:
    branches: [ main ]
    paths:
      - "messages/en.json"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: honyaku-dev/honyaku-action@v1
        with:
          source-file: "messages/en.json"
          output-dir: "messages/generated"
          targets: "ja:ja.json, zh:zh.json, ko:ko.json"
          api-key: ${{ secrets.HONYAKU_API_KEY }}
          custom-prompt: "DO NOT translate, modify, or rewrite values inside \"description\" fields. Use the value of \"description\" as context when translating the value of \"text\" fields."
```

## How It Works

1. Uploads the source file to the Honyaku API.
2. Decompiles the file to extract translatable strings (using the previous analysis history from `honyaku-lock.json` if available for incremental processing).
3. Queues translation jobs for each target locale.
4. Polls for job completion.
5. Downloads the translated files as a ZIP and extracts them to the output directory.
6. Updates `honyaku-lock.json` and commits/pushes the changes.

## Lock File

The action creates a `honyaku-lock.json` file in your repository root to track the analysis history. This file should
be committed to your repository. It enables incremental processing by linking new analyses to previous ones.

To avoid unnecessary runs, use the `paths` filter in your workflow trigger to only run the action when the source file
changes (see the example workflow above).

## License

MIT
