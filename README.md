# Stride Plugins Official

The official plugin marketplace for Stride's internal AI tooling. This repository is the central registry of Claude Code plugins used across Stride's engineering teams.

> **Note:** Only install plugins you trust. Stride maintains this registry, but individual plugins may include MCP servers, scripts, or external dependencies — review each plugin's source before installing.

## Adding This Marketplace

In Claude Code, register this repository as a plugin source:

```sh
/plugin marketplace add stride-build/stride-plugins-official
```

Once added, you can browse and install any plugin listed below.

## Available Plugins

| Plugin | Description | Version |
| --- | --- | --- |
| `code-formatter` | Automatic code formatting on save | 2.1.0 |
| `deployment-tools` | Deployment automation tools | — |

To install a specific plugin:

```sh
/plugin install <plugin-name>
```

Or browse all available plugins interactively:

```sh
/plugin > Discover
```

## Structure

```text
stride-plugins-official/
├── .claude-plugin/
│   └── marketplace.json   # Marketplace registry
└── plugins/               # Locally hosted plugins
    └── <plugin-name>/
        ├── .claude-plugin/
        │   └── plugin.json
        └── README.md
```

Plugins sourced from external GitHub repositories are referenced by repo path in `marketplace.json` and fetched at install time.

## Contributing

To add a new plugin to the registry, update `.claude-plugin/marketplace.json` with an entry pointing to either a local `./plugins/<name>` directory or an external `github` source, then open a PR for review.

See the existing entries in `marketplace.json` as a reference for the expected format.

## License

See individual plugin directories for their respective licenses.
