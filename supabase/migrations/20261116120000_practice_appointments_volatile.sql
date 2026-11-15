-- Etappe P5b, Korrektur: practice_appointment_check und practice_free_slots legen beim ersten Aufruf die
-- Standard-Sprechzeiten an (private.ensure_schedule). Als STABLE markiert führt PostgREST sie in einer
-- Nur-Lese-Transaktion aus – das Einfügen schlägt dann fehl („cannot execute INSERT in a read-only transaction“).
-- Darum als VOLATILE (Standard) markieren; an Rechten und Verhalten ändert sich sonst nichts.
alter function public.practice_appointment_check(timestamptz, integer, uuid) volatile;
alter function public.practice_free_slots(integer, date, integer, integer, uuid) volatile;
alter function private.appointment_warnings(uuid, timestamptz, integer, uuid) volatile;
