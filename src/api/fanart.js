const axios = require('axios');
const log = require('../helpers/logger');

const getFanartPoster = async (tmdbId, preferredLang, fanartApiKey) => {
    try {
        const url = `https://webservice.fanart.tv/v3/movies/${tmdbId}/?api_key=${fanartApiKey}`;
        
        log.debug(`Fetching Fanart logos from: ${url}`);

        const response = await axios.get(url);
        const logos = response.data.hdmovielogo || [];
        
        log.debug(`Logos fetched: ${JSON.stringify(logos)}`);

        const preferredLangLogos = logos.filter(logo => logo.lang === preferredLang);
        log.debug(`Logos in preferred language (${preferredLang}): ${JSON.stringify(preferredLangLogos)}`);

        const bestLogoInPreferredLang = preferredLangLogos.sort((a, b) => b.likes - a.likes)[0];
        log.debug(`Best logo in preferred language: ${JSON.stringify(bestLogoInPreferredLang)}`);

        if (!bestLogoInPreferredLang) {
            const englishLogos = logos.filter(logo => logo.lang === 'en');
            log.debug(`Logos in English: ${JSON.stringify(englishLogos)}`);

            const bestLogoInEnglish = englishLogos.sort((a, b) => b.likes - a.likes)[0];
            log.debug(`Best logo in English: ${JSON.stringify(bestLogoInEnglish)}`);

            return bestLogoInEnglish ? bestLogoInEnglish.url.replace('http://', 'https://') : '';
        }

        const bestLogoUrl = bestLogoInPreferredLang.url.replace('http://', 'https://');
        log.debug(`Best logo URL: ${bestLogoUrl}`);
        return bestLogoUrl;
    } catch (error) {
        log.error(`Error fetching logos from Fanart.tv for TMDB ID ${tmdbId}:`, error.message);
        return '';
    }
};

module.exports = { getFanartPoster };
