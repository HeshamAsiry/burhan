insert into storage.buckets
  (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'burhan-audio',
    'burhan-audio',
    false,
    20971520,
    array[
      'audio/flac',
      'audio/mpeg',
      'audio/mp4',
      'audio/ogg',
      'audio/wav',
      'audio/webm',
      'audio/x-m4a',
      'audio/m4a'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
