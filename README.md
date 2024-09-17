# Stremio Catalog Providers

## Key features

- **Dynamic streaming platform management**: Manage over **600 streaming platforms**, adapting to user configurations on the addon's settings page.

- **Popular and new movies and series**: Retrieve and organize content into popular and recent catalogs for easy access. The content, including titles and posters, is fetched in the language configured by the user.

- **Region-specific content**: Aggregate region-specific content (e.g., Netflix FR, Netflix US) into a unified catalog, ensuring users have access to localized content.

- **Age-based filtering (Kids catalog)**: Filter content based on set age ranges using US certifications, excluding inappropriate genres. Detailed guidelines are accessible via the "?" icon in the settings.

- **Advanced catalog filtering**: Filter catalogs by genre, rating, and release year.

- **Customizable catalog display**: Arrange catalog displays in the preferred order through the addon's configuration page.

- **RPDB integration**: A web service that provides movie and series posters along with ratings, enhancing the visual and informational aspects of the catalogs.

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

      # Cache duration for catalog content in days
      CACHE_CATALOG_CONTENT_DURATION_DAYS: 3

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
