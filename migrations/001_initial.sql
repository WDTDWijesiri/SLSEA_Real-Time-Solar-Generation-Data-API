CREATE TABLE IF NOT EXISTS provinces (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  code varchar(10) NOT NULL UNIQUE,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS districts (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  province_id int unsigned NOT NULL,
  name varchar(100) NOT NULL,
  code varchar(10) NOT NULL UNIQUE,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_district_province_name (province_id, name),
  KEY idx_districts_province (province_id),
  CONSTRAINT fk_district_province FOREIGN KEY (province_id) REFERENCES provinces(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS grid_substations (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  district_id int unsigned NOT NULL,
  name varchar(120) NOT NULL,
  code varchar(20) NOT NULL UNIQUE,
  capacity_mva decimal(8,2) NOT NULL CHECK (capacity_mva > 0),
  latitude decimal(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude decimal(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_substation_district_name (district_id, name),
  KEY idx_substations_district (district_id),
  CONSTRAINT fk_substation_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS solar_installations (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  substation_id int unsigned NOT NULL,
  name varchar(140) NOT NULL,
  meter_id varchar(50) NOT NULL UNIQUE,
  capacity_kw decimal(8,3) NOT NULL CHECK (capacity_kw > 0),
  latitude decimal(9,6) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude decimal(9,6) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  commissioned_on date NOT NULL,
  status enum('active', 'inactive', 'maintenance') NOT NULL DEFAULT 'active',
  device_secret_hash varchar(100) NOT NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_installations_substation (substation_id),
  CONSTRAINT fk_installation_substation FOREIGN KEY (substation_id) REFERENCES grid_substations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS generation_readings (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  installation_id int unsigned NOT NULL,
  recorded_at datetime(3) NOT NULL,
  power_kw decimal(9,3) NOT NULL CHECK (power_kw >= 0),
  cumulative_energy_kwh decimal(14,3) NOT NULL CHECK (cumulative_energy_kwh >= 0),
  voltage_v decimal(7,2) NOT NULL CHECK (voltage_v > 0),
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_reading_installation_time (installation_id, recorded_at),
  KEY idx_readings_installation_time (installation_id, recorded_at DESC),
  KEY idx_readings_recorded_at (recorded_at DESC),
  CONSTRAINT fk_reading_installation FOREIGN KEY (installation_id) REFERENCES solar_installations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS users (
  id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email varchar(255) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  password_hash varchar(100) NOT NULL,
  role enum('national', 'province', 'district') NOT NULL,
  province_id int unsigned NULL,
  district_id int unsigned NULL,
  created_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_province FOREIGN KEY (province_id) REFERENCES provinces(id) ON DELETE RESTRICT,
  CONSTRAINT fk_user_district FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE RESTRICT,
  CONSTRAINT chk_user_scope CHECK (
    (role = 'national' AND province_id IS NULL AND district_id IS NULL) OR
    (role = 'province' AND province_id IS NOT NULL AND district_id IS NULL) OR
    (role = 'district' AND province_id IS NULL AND district_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
