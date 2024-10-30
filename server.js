const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');

const app = express();
const port = 3000;

const cache = new NodeCache({ stdTTL: 3600 }); // Cache para 3600 segundos (1 hora)

app.use(express.json());

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});

// Endpoint para buscar canciones de una banda
app.get('/search_tracks', async (req, res) => {
  // obtenemos el nombre de la banda desde los parametros de la consulta
  const { name } = req.query;

  // Verificamos si el parámetro "name" fue colocado
  if (!name) {
    return res.status(400).json({ message: 'El parámetro name es obligatorio' });
  }

  // Verificar si los resultados ya están en la caché
  const cachedData = cache.get(name);
  if (cachedData) {
    console.log('Datos obtenidos de la caché');
    return res.json(cachedData);
  }

  try {
    // Hacer la solicitud a la API de iTunes
    const encodedName = encodeURIComponent(name);
    console.log(`Nombre de la banda codificado: ${encodedName}`);

    const response = await axios.get(`https://itunes.apple.com/search?term=${encodedName}&entity=song&limit=25`);
    console.log('Respuesta de la API de iTunes:', response.data);
    const tracks = response.data.results;

    if (!tracks || tracks.length === 0) {
      console.log('No se encontraron canciones en la respuesta de iTunes');
      return res.status(404).json({ message: 'No se encontraron canciones para la banda especificada' });
    }

    // Filtrar las canciones por el nombre exacto de la banda, ignorando mayúsculas/minúsculas y espacios
    const normalizedInput = name.toLowerCase().replace(/\s+/g, '');
    const filteredTracks = tracks.filter(track => 
      track.artistName.toLowerCase().replace(/\s+/g, '') === normalizedInput
    );
    console.log('Canciones filtradas:', filteredTracks);

    if (filteredTracks.length === 0) {
      return res.status(404).json({ message: 'No se encontraron canciones del artista especificado' });
    }

    // Obtener la lista única de álbumes de las canciones encontradas
    const albums = [...new Set(filteredTracks.map(track => track.collectionName))];
    console.log('Álbumes encontrados:', albums);

    // Preparar la respuesta a retornar
    const result = {
      total_albumes: albums.length,
      total_canciones: filteredTracks.length,
      albumes: albums,
      canciones: filteredTracks.map(track => ({
        cancion_id: track.trackId,
        nombre_album: track.collectionName,
        nombre_tema: track.trackName,
        preview_url: track.previewUrl,
        fecha_lanzamiento: track.releaseDate,
        precio: {
          valor: track.trackPrice,
          moneda: track.currency
        }
      }))
    };

    // Guardar la respuesta en la caché para futuras consultas
    cache.set(name.toLowerCase(), result);
    console.log('Respuesta cacheada y enviada:', result);

    // Retornar los resultados
    res.json(result);
  } catch (error) {
    console.error('Error al consultar la API de iTunes:', error.message);
    res.status(500).json({ message: 'Error al consultar la API de iTunes', error: error.message });
  }
});

// Lista temporal para almacenar los favoritos
const favoritos = [];

app.post('/favoritos', (req, res) => {
  const { nombre_banda, cancion_id, usuario, ranking } = req.body;

  if (!nombre_banda || !cancion_id || !usuario || !ranking) {
    return res.status(400).json({ message: 'Todos los campos son obligatorios' });
  }

  // Normalizar el nombre de la banda para buscar en la cache
  const normalizedBandName = nombre_banda.toLowerCase();

  //verificar si la cancion existe en el cache
  const cacheData = cache.get(normalizedBandName);
  if (!cacheData) {
    return res.status(404).json({ message: 'La banda no se encuentra en la cache'});
  }

  const cancion = cacheData.canciones.find(track => track.cancion_id === cancion_id);
  if (!cancion) {
    return res.status(404).json({ message: 'La canción no fue encontrada'});
  }

  // Verificar si la canción ya fue marcada como favorita por el mismo usuario
  const yaEsFavorita = favoritos.some(
    favorito => favorito.cancion_id === cancion_id && favorito.usuario === usuario
  );

  if (yaEsFavorita) {
    return res.status(400).json({ message: 'La canción ya fue marcada como favorita por este usuario' });
  }

  //AGREGAR A FAVORITOS
  favoritos.push({
    nombre_banda,
    cancion_id,
    usuario,
    ranking
  });
  res.json({ message: 'Cancion marcada como favorita exitosamente', favoritos});
})
