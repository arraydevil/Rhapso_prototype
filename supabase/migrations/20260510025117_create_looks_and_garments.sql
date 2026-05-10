/*
  # Create looks and garments tables for Rhapso

  1. New Tables
    - `looks`
      - `id` (uuid, primary key)
      - `name` (text) - Look name
      - `skin_tone` (text) - Mannequin skin tone
      - `body_type` (text) - Mannequin body type
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `garments`
      - `id` (uuid, primary key)
      - `look_id` (uuid, foreign key to looks)
      - `category` (text) - top, bottom, shoes, or accessory
      - `name` (text) - Garment name
      - `image_url` (text) - Image URL
      - `shop_url` (text, nullable) - Link to shop
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on both tables
    - Public access for reads (anyone can view looks)
    - No insert/update/delete policies initially (MVP - local storage only)

  3. Indexes
    - Index on looks.created_at for efficient sorting
    - Index on garments.look_id for efficient lookups
*/

CREATE TABLE IF NOT EXISTS looks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Meu Look',
  skin_tone text NOT NULL DEFAULT 'ivory',
  body_type text NOT NULL DEFAULT 'standard',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS garments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  look_id uuid NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  category text NOT NULL,
  name text NOT NULL,
  image_url text NOT NULL,
  shop_url text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS looks_created_at_idx ON looks(created_at DESC);
CREATE INDEX IF NOT EXISTS garments_look_id_idx ON garments(look_id);

ALTER TABLE looks ENABLE ROW LEVEL SECURITY;
ALTER TABLE garments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Looks are publicly readable"
  ON looks FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Garments are publicly readable"
  ON garments FOR SELECT
  TO public
  USING (true);
