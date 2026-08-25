START TRANSACTION;
SET foreign_key_checks = 0;
SET unique_checks = 0;
INSERT INTO `parks` (`id`, `name`, `region`, `opened_at`, `latitude`, `amenities`, `active`) VALUES
(1,'Spokane Retreat','south-west','2023-08-29',58.3752,'["shop","wifi"]',1),
(2,'East Cary Retreat','wales','2023-07-28',53.5384,'["playground"]',1),
(3,'Escondido Meadows','north-east','2025-11-17',53.2977,'["laundry","electricity","pool","wifi"]',1),
(4,'Port Dominique Retreat','north-east','2025-01-05',56.3116,'["shop"]',1),
(5,'Lake Cliffordfurt Park','wales','2023-03-06',58.1359,'["electricity","playground","wifi"]',1),
(6,'Lukeberg Sands','south-west','2023-08-28',58.2329,'["playground","laundry","wifi"]',1),
(7,'Dareberg Retreat','wales','2024-08-07',57.4944,'["laundry","wifi"]',1),
(8,'Georgiastad Acres','north-east','2024-05-21',53.958,'["laundry","playground","electricity","pool"]',1),
(9,'East Lawrenceworth Sands','wales','2024-08-17',51.5303,'["pool","laundry"]',1),
(10,'Sawaynborough Sands','wales','2021-12-26',55.8731,'["pool"]',1),
(11,'Schinnermouth Retreat','wales','2022-11-09',56.3024,'["shop","electricity"]',1),
(12,'Chino Hills Sands','wales','2023-11-04',50.9334,'["wifi","laundry"]',1),
(13,'Emmerich-Rohanshire Park','east-anglia','2022-05-02',53.502,'["wifi","electricity","laundry","pool"]',1),
(14,'Kimmouth Sands','south-west','2021-09-13',50.6668,'["wifi","shop","laundry","electricity"]',1),
(15,'Fort Miltontown Park','south-west','2023-04-16',54.4747,'["playground"]',1),
(16,'Oshkosh Park','north-east','2022-11-18',52.726,'["wifi","electricity"]',1),
(17,'Sunnystead Acres','wales','2022-01-28',51.0988,'["playground"]',1),
(18,'Weberborough Park','wales','2025-09-14',58.0957,'["pool","electricity"]',1),
(19,'Spokane Valley Sands','north-east','2025-08-29',50.1663,'["wifi","pool"]',1),
(20,'North Gideon Park','north-east','2023-08-25',55.8927,'["shop"]',1);
COMMIT;
