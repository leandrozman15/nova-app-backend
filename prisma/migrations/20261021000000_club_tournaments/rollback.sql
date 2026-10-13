DROP TABLE IF EXISTS "TournamentEntry";
DROP TABLE IF EXISTS "ClubTournament";
DROP TYPE IF EXISTS "TournamentEntryStatus";
DROP TYPE IF EXISTS "TournamentStatus";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261021000000_club_tournaments';
