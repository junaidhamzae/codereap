# Changelog

## [0.11.0] - 2025-08-14

### Added
- Built-in local viewer for interactive report exploration
- New CLI flags: `--viewer`, `--port`, `--host`, `--no-open`
- Web-based tree navigation with expand/collapse and "Only orphans" filter
- Prioritize Pruning tables with sorting strategies and extension filters
- Copy functionality for file paths and batch operations
- Privacy-focused: all processing happens locally in the browser

### Technical
- Zero-dependency static HTTP server using Node.js core modules
- ESM frontend modules with CommonJS fallbacks for tests
- Cross-platform browser launching (macOS, Windows, Linux)
- Ephemeral port allocation by default to avoid conflicts

## [0.10.3] - Previous release
- Base functionality for dependency graph analysis and orphan detection
