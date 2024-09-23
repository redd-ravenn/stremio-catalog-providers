# Changelog

## [1.3.0] - 2024-09-24
### Added
- Enabled recommendations and similar content display on content pages.
- Option to rename and translate catalog titles in the addon settings page.

## [1.2.0] - 2024-09-23
### Added
- Redesigned the search bar to display all platforms matching the query, not just the currently displayed platforms.
- Automatically adds associated regional catalogs when a platform is selected.

### Fixed
- Resolved issue with Trakt history retrieval by adding `type` to database queries, preventing false positives due to non-unique TMDB IDs for movies and shows.

## [1.1.2] - 2024-09-22
### Added
- Stremio config button now manages all Trakt-related parameters.

### Fixed
- Genres now display correctly in the defined language when using multiple language configurations.
- Resolved issue with catalogs not fetching correctly from the cache in multi-language configurations.
- Fixed broken Stremio config button caused by Base64 encoding of URL parameters.

## [1.1.1] - 2024-09-21
### Added
- API key for TMDB was added to the requests.
- Replaced content title with logo in the selected language or English by default.
- Updated the addon ID to match the prototype name.
- Added prototype logo.

## [1.0.0] - 2024-09-20
### Migration
- Migrated SQLite databases to PostgreSQL.
- Migrated SQLite caching system to Redis.

### Improved
- Enhanced user interface for better provider display and management.
- Fixed multiple region handling in catalog results.
- Resolved issues with genre display and the "Mark as Watched" button for Trakt integration.

### Removed
- Dropped redundant country selection dropdown, replaced with region-based catalog fetch logic.

## [0.5.0] - 2024-09-19
### Added
- Automatic Trakt token refresh to avoid manual re-authentication every 3 months.
- Button to mark content as watched on Trakt directly from Stremio with customizable text and translation options.
- Environment variable to configure the history sync interval.
- Compliance with Trakt rate limits.

## [0.4.0] - 2024-09-18
### Added
- Trakt integration for syncing watch history automatically every 24 hours (configurable via environment variable).
- Option to add an emoji next to watched content synced from Trakt.

## [0.3.0] - 2024-09-17
### Added
- New filters for rating range and year.
- Prefetch system for faster page loading.
- Base64 URL parameter obfuscation for security.

## [0.2.0] - 2024-09-16
### Refactored
- TMDB API handling with improved rate limiting.
- Restructured project for better maintainability.

### Added
- Enhanced UI elements.
- Stremio config button.

### Removed
- Removed TMDB token, language, and watch region environment variables.

## [0.1.0] - 2024-09-09
### Added
- Multi-region instance support.
- RPDB integration with a fallback to TMDB posters if unavailable in RPDB.

### Fixed
- Improved performance with RPDB poster handling and caching.
- Addressed issues with free RPDB key tier.
- Fixed RPDB cache handling, with cache duration configurable via environment variables.
- Resolved issues with multiple `ageRange` catalog handling.
- Corrected database path, missing languages, and error messages on the configuration page.