-- knowledge: shop_items, shop_category, add_or_update_purchase, user_id — unrecorded
-- knowledge: purchases — .claude/rules/server-state.md
-- Retires the shop. `plans` (also formerly in 80_shop.sql) survives — members.plan
-- FKs to it — and moved to 80_plans.sql with identical DDL, so it does not diff here.

drop policy "Enable insert for users based on user_id" on "public"."purchases";

drop policy "Enable users to view their own data only" on "public"."purchases";

drop policy "members can update their own purchases" on "public"."purchases";

drop policy "Enable read access for all users" on "public"."shop_items";

revoke delete on table "public"."purchases" from "anon";

revoke insert on table "public"."purchases" from "anon";

revoke references on table "public"."purchases" from "anon";

revoke select on table "public"."purchases" from "anon";

revoke trigger on table "public"."purchases" from "anon";

revoke truncate on table "public"."purchases" from "anon";

revoke update on table "public"."purchases" from "anon";

revoke delete on table "public"."purchases" from "authenticated";

revoke insert on table "public"."purchases" from "authenticated";

revoke references on table "public"."purchases" from "authenticated";

revoke select on table "public"."purchases" from "authenticated";

revoke trigger on table "public"."purchases" from "authenticated";

revoke truncate on table "public"."purchases" from "authenticated";

revoke update on table "public"."purchases" from "authenticated";

revoke delete on table "public"."purchases" from "service_role";

revoke insert on table "public"."purchases" from "service_role";

revoke references on table "public"."purchases" from "service_role";

revoke select on table "public"."purchases" from "service_role";

revoke trigger on table "public"."purchases" from "service_role";

revoke truncate on table "public"."purchases" from "service_role";

revoke update on table "public"."purchases" from "service_role";

revoke delete on table "public"."shop_items" from "anon";

revoke insert on table "public"."shop_items" from "anon";

revoke references on table "public"."shop_items" from "anon";

revoke select on table "public"."shop_items" from "anon";

revoke trigger on table "public"."shop_items" from "anon";

revoke truncate on table "public"."shop_items" from "anon";

revoke update on table "public"."shop_items" from "anon";

revoke delete on table "public"."shop_items" from "authenticated";

revoke insert on table "public"."shop_items" from "authenticated";

revoke references on table "public"."shop_items" from "authenticated";

revoke select on table "public"."shop_items" from "authenticated";

revoke trigger on table "public"."shop_items" from "authenticated";

revoke truncate on table "public"."shop_items" from "authenticated";

revoke update on table "public"."shop_items" from "authenticated";

revoke delete on table "public"."shop_items" from "service_role";

revoke insert on table "public"."shop_items" from "service_role";

revoke references on table "public"."shop_items" from "service_role";

revoke select on table "public"."shop_items" from "service_role";

revoke trigger on table "public"."shop_items" from "service_role";

revoke truncate on table "public"."shop_items" from "service_role";

revoke update on table "public"."shop_items" from "service_role";

alter table "public"."purchases" drop constraint "purchases_item_id_fkey";

alter table "public"."purchases" drop constraint "purchases_member_id_fkey";

alter table "public"."purchases" drop constraint "unique_member_item";

drop function if exists "public"."add_or_update_purchase"(member uuid, item integer, qty integer);

alter table "public"."purchases" drop constraint "purchases_pkey";

alter table "public"."shop_items" drop constraint "items_pkey";

drop index if exists "public"."items_pkey";

drop index if exists "public"."purchases_member_id_idx";

drop index if exists "public"."purchases_pkey";

drop index if exists "public"."unique_member_item";

drop table "public"."purchases";

drop table "public"."shop_items";

drop type "public"."shop_category";


