# Icon Fetcher

Fetch and clean SVG icons from [Simple Icons](https://simpleicons.org).

## How It Works

1. Add icon names (one per line) to `icon-list.txt`.
2. Push changes or trigger the workflow manually.
3. GitHub Actions downloads icons, cleans them, and commits them to `icons/`.

## Icon Cleaning

The script moves any `fill` or `color` attribute from the root `<svg>` tag
to inner elements (like `<path>`). This ensures colors survive when the SVG
content is extracted and reused inside a wrapper SVG in another project.

## Usage

1. Edit `icon-list.txt` with the icon names you need.
2. Commit and push.
3. Wait for the GitHub Action to finish.
4. Download the `icons/` folder and use it in your project.

## Requirements

- Icon names must match the `slug` used by Simple Icons.
- Comments start with `#`.
- .
