# Stremio Catalogs Providers

Docker Compose : 

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

      # Authentication token for TMDB (define this value with your token, not api key, if you want to enabled public instance, can be blank but user must define own api key)
      TMDB_BEARER_TOKEN:

      # Language for TMDB data
      # Use ISO 639-1 language code (they're listed in doc/languages.json)
      TMDB_LANGUAGE: fr

      # Region for TMDB stream availability
      # Use ISO 3166-1 region code (they're listed in doc/regions.json)
      TMDB_WATCH_REGION: FR

      # Possible values: 'info' or 'debug'
      # Default is 'info' if not specified; 'debug' provides more detailed logs
      LOG_LEVEL: info

      # Can be expressed in days (d), weeks (w), or months (M)
      # For example, '3d' means logs will be kept for 3 days before being deleted
      # If not specified, the default value is '3d'
      LOG_INTERVAL_DELETION: 3d
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

## Docker Build

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
Thank you for considering contributing to the Stremio Catalogs Providers project! This project is currently in its very early stages of development, and we welcome any and all contributions. Whether you want to [report an issue](https://github.com/redd-ravenn/stremio-catalog-providers/issues), suggest a new feature, or submit a pull request, your involvement is greatly appreciated.
