# honyaku.dev Automatic Translation GitHub Action

A GitHub Action that automatically translates files using the [honyaku.dev](https://honyaku.dev) API. It uploads your
source file, translates it into multiple target languages using AI, and commits the results back to your repository.

## Features

- AI-powered translation with multiple translator models (GPT-4.1 mini, Claude Haiku 4.5, etc.)
- Supports 180+ languages
- Incremental translation using a lock file (`honyaku-lock.json`) to skip unchanged files
- Automatically commits and pushes translated files
- Custom prompts for fine-tuning translation output

## Usage

```yaml
- uses: toshimichi/honyaku-action@v0
  with:
    source-file: "en_US.json"
    output-dir: "lang"
    targets: "ja:ja_JP.json, zh:zh_CN.json, ko:ko_KR.json"
    api-key: ${{ secrets.HONYAKU_API_KEY }}
```

## Inputs

| Name            | Required | Default                      | Description                                                                                                      |
|-----------------|----------|------------------------------|------------------------------------------------------------------------------------------------------------------|
| `source-file`   | Yes      |                              | Path to the source translation file                                                                              |
| `output-dir`    | Yes      |                              | Output directory for translated files                                                                            |
| `targets`       | Yes      |                              | Comma-separated list of target locales in the format `<locale>:<filename>` (e.g. `ja:ja_JP.json, ko:ko_KR.json`) |
| `api-key`       | Yes      |                              | API key for authentication (get one at [honyaku.dev](https://honyaku.dev))                                       |
| `translator-id` | No       | `gpt_4_1_mini`               | Translator model ID                                                                                              |
| `custom-prompt` | No       | `""`                         | Custom prompt for the translator                                                                                 |
| `base-url`      | No       | `https://honyaku.dev/api/v1` | Base URL of the Honyaku API                                                                                      |

## Example Workflow

```yaml
name: Translate

on:
  push:
    branches: [ main ]
    paths:
      - "en_US.json"

permissions:
  contents: write

jobs:
  translate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: toshimichi/honyaku-action@v1
        with:
          source-file: "en_US.json"
          output-dir: "lang"
          targets: "ja:ja_JP.json, zh:zh_CN.json, ko:ko_KR.json"
          api-key: ${{ secrets.HONYAKU_API_KEY }}
          custom-prompt: "Translate for a casual mobile game UI"
```

## How It Works

1. Computes the SHA-256 hash of the source file and compares it against `honyaku-lock.json`. If unchanged, the action
   exits early.
2. Uploads the source file to the Honyaku API.
3. Decompiles the file to extract translatable strings.
4. Queues translation jobs for each target locale.
5. Polls for job completion.
6. Downloads the translated files as a ZIP and extracts them to the output directory.
7. Updates `honyaku-lock.json` and commits/pushes the changes.

## Lock File

The action creates a `honyaku-lock.json` file in your repository root to track the state of translations. This file
should be committed to your repository. It prevents redundant translations when the source file hasn't changed.

## License

MIT
