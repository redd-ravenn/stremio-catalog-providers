# Stremio Catalog Providers

## Key features

- **Dynamic streaming platform management**: Manage over **600 streaming platforms**, adapting to user configurations on the addon's settings page.

- **Popular and new movies and series**: Retrieve and organize content into popular and recent catalogs for easy access. The content, including titles and posters, is fetched in the language configured by the user.

- **Region-specific content**: Aggregate region-specific content (e.g., Netflix FR, Netflix US) into a unified catalog, ensuring users have access to localized content.

- **Age-based filtering (Kids catalog)**: Filter content based on set age ranges using US certifications, excluding inappropriate genres. Detailed guidelines are accessible via the "?" icon in the settings.

- **Advanced catalog filtering**: Filter catalogs by genre, rating, and release year.

- **Customizable catalog display**: Arrange catalog displays in the preferred order through the addon's configuration page.

- **Trakt Integration**:
  - **Sync Trakt history**: Synchronize your Trakt watch history with Stremio, ensuring your watched items are marked in your catalogs with a custom emoji of your choice.
  - **Automatic synchronization**: Trakt history sync occurs automatically everyday, interval can be customized through an environment variable.
  - **Token refresh**: Automatic token refresh, avoiding the need for reauthentication every three months.
  - **Mark content as watched**: Users can manually mark content as watched on Trakt directly from Stremio, with the flexibility to rename or translate the action button text according to their language.

- **RPDB integration**: A web service that provides movie and series posters along with ratings, enhancing the visual and informational aspects of the catalogs.

- **Fanart integration**: Enhance the visual appeal of content by replacing titles with logos in the selected language or English by default, when available.

- **Progressive scraping**: Prefetch upcoming content pages as you scroll to enhance loading times. Ensuring smooth and reliable performance.

- **Customizable cache management**:
  - **Catalog cache duration**: Adjust cache duration through an environment variable to balance performance with content freshness.
  - **RPDB poster caching**: Customize cache duration to reduce RPDB API load, also managed via an environment variable.

- **Data sourced from TMDB**: All catalog data is sourced from TMDB, adhering to their Terms of Service. This product uses the TMDB API but is not endorsed or certified by TMDB. 

## Docker Compose

```yaml
version: '3.8'

services:
  stremio-catalog-providers:
    image: reddravenn/stremio-catalog-providers
    ports:
      # Map port 8080 on the host to port 7000 in the container
      - "8080:7000"
    environment:
      # Port to listen on inside the container
      PORT: 7000

      # URL to access the addon
      BASE_URL: http://localhost:7000

      # PostgreSQL database connection settings
      DB_USER: your_user               # Username for PostgreSQL authentication
      DB_HOST: your_host               # PostgreSQL server hostname or IP
      DB_NAME: your_database           # Name of the database to connect to
      DB_PASSWORD: your_password       # Password for the PostgreSQL user
      DB_PORT: 5432                    # Port number where PostgreSQL is running (default 5432)
      DB_MAX_CONNECTIONS: 20           # Maximum number of active connections allowed to the database
      DB_IDLE_TIMEOUT: 30000           # Time (in ms) to close idle database connections
      DB_CONNECTION_TIMEOUT: 2000      # Timeout (in ms) to establish a new database connection

      # Redis cache configuration
      REDIS_HOST: your_host            # Redis server hostname or IP
      REDIS_PORT: 6379                 # Port number where Redis is running (default 6379)
      REDIS_PASSWORD:                  # Password for Redis authentication (if required)      

      # These credentials are required to interact with the Trakt API and access its services.
      # To obtain these credentials:
      # 1. Create an account on Trakt.tv (https://trakt.tv).
      # 2. Go to the applications section (https://trakt.tv/oauth/applications).
      # 3. Create a new application by filling in the required information (name, description, etc.).
      #    - For the "Redirect URL", use the following format: BASE_URL + /callback (e.g., http://localhost:7000/callback).
      TRAKT_CLIENT_ID:
      TRAKT_CLIENT_SECRET:

      # Allows you to define the interval for synchronizing the Trakt watch history
      # The value can be expressed in hours (h) or days (d)
      # Default is '1d'
      TRAKT_HISTORY_FETCH_INTERVAL: 1d

      # Cache duration for catalog content in days
      CACHE_CATALOG_CONTENT_DURATION_DAYS: 1

      # Cache duration for RPDB poster content in days
      CACHE_POSTER_CONTENT_DURATION_DAYS: 7

      # Possible values: 'info' or 'debug'
      # Default is 'info' if not specified; 'debug' provides more detailed logs
      LOG_LEVEL: info

      # Can be expressed in days (d), weeks (w), or months (M)
      # For example, '3d' means logs will be kept for 3 days before being deleted
      # If not specified, the default value is '3d'
      LOG_INTERVAL_DELETION: 3d

      # The environment in which the Node.js application is running
      NODE_ENV: production      
    volumes:
      # Defines a volume for storing data from the container on the host.
      # Replace /your/path/to/* with the path of your choice on the host where you want to store the data.
      - /your/path/to/db:/usr/src/app/db
      - /your/path/to/log:/usr/src/app/log
```

## Build

To set up and run the project using a classic Node.js environment:

1. Clone the repository:
    ```bash
    git clone https://github.com/redd-ravenn/stremio-catalog-providers.git
    ```

2. Navigate into the project directory:
    ```bash
    cd stremio-catalog-providers
    ```

3. Install the required dependencies:
    ```bash
    npm install
    ```

4. Run the application:
    ```bash
    node index.js
    ```

## Docker build

To build and run the project using Docker:

1. Clone the repository:
    ```bash
    git clone https://github.com/redd-ravenn/stremio-catalog-providers.git
    ```

2. Navigate into the project directory:
    ```bash
    cd stremio-catalog-providers
    ```

3. Build the Docker image:
    ```bash
    docker build -t yourusername/stremio-catalog-providers .
    ```

4. Run the Docker container:
    ```bash
    docker run -p 8080:7000 yourusername/stremio-catalog-providers
    ```

Make sure to replace `yourusername` with your Docker Hub username or preferred image name.

## Contributing
Contribtutions are welcome and appreciated! This project is currently in its very early stages of development, and we welcome any and all contributions. Whether you want to [report an issue](https://github.com/redd-ravenn/stremio-catalog-providers/issues), suggest a new feature, or submit a pull request, your involvement is greatly appreciated.
