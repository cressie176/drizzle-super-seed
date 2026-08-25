BEGIN;
SET session_replication_role = replica;
COPY "public"."parks" ("id", "name", "region", "opened_at", "latitude", "amenities", "active") FROM stdin;
1	Spokane Retreat	south-west	2025-04-06	58.3752	["shop","wifi"]	t
2	East Cary Retreat	wales	2022-04-03	53.5384	["playground"]	t
3	Escondido Meadows	wales	2026-06-04	53.2977	["laundry","electricity","pool","wifi"]	t
4	Port Dominique Retreat	north-east	2021-10-23	56.3116	["shop"]	t
5	Lake Cliffordfurt Park	wales	2026-01-06	58.1359	["electricity","playground","wifi"]	t
6	Lukeberg Sands	east-anglia	2023-12-21	58.2329	["playground","laundry","wifi"]	t
7	Dareberg Retreat	north-east	2025-02-01	57.4944	["laundry","wifi"]	t
8	Georgiastad Acres	south-west	2026-07-10	53.958	["laundry","playground","electricity","pool"]	t
9	East Lawrenceworth Sands	south-west	2025-06-22	51.5303	["pool","laundry"]	t
10	Sawaynborough Sands	south-west	2022-05-18	55.8731	["pool"]	t
11	Schinnermouth Retreat	north-east	2025-01-16	56.3024	["shop","electricity"]	t
12	Chino Hills Sands	south-west	2024-04-23	50.9334	["wifi","laundry"]	t
13	Emmerich-Rohanshire Park	south-west	2026-04-21	53.502	["wifi","electricity","laundry","pool"]	t
14	Kimmouth Sands	east-anglia	2021-11-08	50.6668	["wifi","shop","laundry","electricity"]	t
15	Fort Miltontown Park	wales	2022-08-28	54.4747	["playground"]	t
16	Oshkosh Park	wales	2025-08-14	52.726	["wifi","electricity"]	t
17	Sunnystead Acres	north-east	2025-12-22	51.0988	["playground"]	t
18	Weberborough Park	east-anglia	2022-04-13	58.0957	["pool","electricity"]	t
19	Spokane Valley Sands	south-west	2023-07-12	50.1663	["wifi","pool"]	t
20	North Gideon Park	south-west	2021-12-03	55.8927	["shop"]	t
\.
COMMIT;
