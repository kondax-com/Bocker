/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as constants from "../constants.js";
import type * as coupon_config_mutation from "../coupon/config/mutation.js";
import type * as coupon_config_query from "../coupon/config/query.js";
import type * as coupon_exclusion_menu_mutation from "../coupon/exclusion_menu/mutation.js";
import type * as coupon_exclusion_menu_query from "../coupon/exclusion_menu/query.js";
import type * as coupon_mutation from "../coupon/mutation.js";
import type * as coupon_query from "../coupon/query.js";
import type * as crons from "../crons.js";
import type * as menu_menu_exclusion_staff_mutation from "../menu/menu_exclusion_staff/mutation.js";
import type * as menu_menu_exclusion_staff_query from "../menu/menu_exclusion_staff/query.js";
import type * as menu_mutation from "../menu/mutation.js";
import type * as menu_query from "../menu/query.js";
import type * as migration_action from "../migration/action.js";
import type * as migration_monitoring from "../migration/monitoring.js";
import type * as migration_mutation from "../migration/mutation.js";
import type * as migration_query from "../migration/query.js";
import type * as migrations from "../migrations.js";
import type * as option_mutation from "../option/mutation.js";
import type * as option_query from "../option/query.js";
import type * as option_stock from "../option/stock.js";
import type * as organization_api_config_mutation from "../organization/api_config/mutation.js";
import type * as organization_api_config_query from "../organization/api_config/query.js";
import type * as organization_config_mutation from "../organization/config/mutation.js";
import type * as organization_config_query from "../organization/config/query.js";
import type * as organization_exception_schedule_mutation from "../organization/exception_schedule/mutation.js";
import type * as organization_exception_schedule_query from "../organization/exception_schedule/query.js";
import type * as organization_mutation from "../organization/mutation.js";
import type * as organization_query from "../organization/query.js";
import type * as organization_reservation_config_mutation from "../organization/reservation_config/mutation.js";
import type * as organization_reservation_config_query from "../organization/reservation_config/query.js";
import type * as organization_tutorial_mutation from "../organization/tutorial/mutation.js";
import type * as organization_tutorial_query from "../organization/tutorial/query.js";
import type * as organization_week_schedule_mutation from "../organization/week_schedule/mutation.js";
import type * as organization_week_schedule_query from "../organization/week_schedule/query.js";
import type * as point_action from "../point/action.js";
import type * as point_mutation from "../point/mutation.js";
import type * as point_query from "../point/query.js";
import type * as reservation_action from "../reservation/action.js";
import type * as reservation_checkout_mutation from "../reservation/checkout/mutation.js";
import type * as reservation_manage from "../reservation/manage.js";
import type * as reservation_mutation from "../reservation/mutation.js";
import type * as reservation_notification_mutation from "../reservation/notification/mutation.js";
import type * as reservation_notification_query from "../reservation/notification/query.js";
import type * as reservation_payment from "../reservation/payment.js";
import type * as reservation_query from "../reservation/query.js";
import type * as staff_action from "../staff/action.js";
import type * as staff_config_mutation from "../staff/config/mutation.js";
import type * as staff_config_query from "../staff/config/query.js";
import type * as staff_exception_schedule_mutation from "../staff/exception_schedule/mutation.js";
import type * as staff_exception_schedule_query from "../staff/exception_schedule/query.js";
import type * as staff_invitation_action from "../staff/invitation/action.js";
import type * as staff_invitation_mutation from "../staff/invitation/mutation.js";
import type * as staff_invitation_query from "../staff/invitation/query.js";
import type * as staff_mutation from "../staff/mutation.js";
import type * as staff_query from "../staff/query.js";
import type * as staff_role_sync_query from "../staff/role_sync/query.js";
import type * as staff_week_schedule_mutation from "../staff/week_schedule/mutation.js";
import type * as staff_week_schedule_query from "../staff/week_schedule/query.js";
import type * as storage_action from "../storage/action.js";
import type * as tenant_mutation from "../tenant/mutation.js";
import type * as tenant_plan_query from "../tenant/plan/query.js";
import type * as tenant_query from "../tenant/query.js";
import type * as tenant_referral_action from "../tenant/referral/action.js";
import type * as tenant_referral_mutation from "../tenant/referral/mutation.js";
import type * as tenant_referral_query from "../tenant/referral/query.js";
import type * as tenant_subscription_action from "../tenant/subscription/action.js";
import type * as tenant_subscription_mutation from "../tenant/subscription/mutation.js";
import type * as tenant_subscription_query from "../tenant/subscription/query.js";
import type * as types from "../types.js";
import type * as utils_auth from "../utils/auth.js";
import type * as utils_helpers from "../utils/helpers.js";
import type * as utils_validations from "../utils/validations.js";
import type * as webhook_events_mutation from "../webhook_events/mutation.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  constants: typeof constants;
  "coupon/config/mutation": typeof coupon_config_mutation;
  "coupon/config/query": typeof coupon_config_query;
  "coupon/exclusion_menu/mutation": typeof coupon_exclusion_menu_mutation;
  "coupon/exclusion_menu/query": typeof coupon_exclusion_menu_query;
  "coupon/mutation": typeof coupon_mutation;
  "coupon/query": typeof coupon_query;
  crons: typeof crons;
  "menu/menu_exclusion_staff/mutation": typeof menu_menu_exclusion_staff_mutation;
  "menu/menu_exclusion_staff/query": typeof menu_menu_exclusion_staff_query;
  "menu/mutation": typeof menu_mutation;
  "menu/query": typeof menu_query;
  "migration/action": typeof migration_action;
  "migration/monitoring": typeof migration_monitoring;
  "migration/mutation": typeof migration_mutation;
  "migration/query": typeof migration_query;
  migrations: typeof migrations;
  "option/mutation": typeof option_mutation;
  "option/query": typeof option_query;
  "option/stock": typeof option_stock;
  "organization/api_config/mutation": typeof organization_api_config_mutation;
  "organization/api_config/query": typeof organization_api_config_query;
  "organization/config/mutation": typeof organization_config_mutation;
  "organization/config/query": typeof organization_config_query;
  "organization/exception_schedule/mutation": typeof organization_exception_schedule_mutation;
  "organization/exception_schedule/query": typeof organization_exception_schedule_query;
  "organization/mutation": typeof organization_mutation;
  "organization/query": typeof organization_query;
  "organization/reservation_config/mutation": typeof organization_reservation_config_mutation;
  "organization/reservation_config/query": typeof organization_reservation_config_query;
  "organization/tutorial/mutation": typeof organization_tutorial_mutation;
  "organization/tutorial/query": typeof organization_tutorial_query;
  "organization/week_schedule/mutation": typeof organization_week_schedule_mutation;
  "organization/week_schedule/query": typeof organization_week_schedule_query;
  "point/action": typeof point_action;
  "point/mutation": typeof point_mutation;
  "point/query": typeof point_query;
  "reservation/action": typeof reservation_action;
  "reservation/checkout/mutation": typeof reservation_checkout_mutation;
  "reservation/manage": typeof reservation_manage;
  "reservation/mutation": typeof reservation_mutation;
  "reservation/notification/mutation": typeof reservation_notification_mutation;
  "reservation/notification/query": typeof reservation_notification_query;
  "reservation/payment": typeof reservation_payment;
  "reservation/query": typeof reservation_query;
  "staff/action": typeof staff_action;
  "staff/config/mutation": typeof staff_config_mutation;
  "staff/config/query": typeof staff_config_query;
  "staff/exception_schedule/mutation": typeof staff_exception_schedule_mutation;
  "staff/exception_schedule/query": typeof staff_exception_schedule_query;
  "staff/invitation/action": typeof staff_invitation_action;
  "staff/invitation/mutation": typeof staff_invitation_mutation;
  "staff/invitation/query": typeof staff_invitation_query;
  "staff/mutation": typeof staff_mutation;
  "staff/query": typeof staff_query;
  "staff/role_sync/query": typeof staff_role_sync_query;
  "staff/week_schedule/mutation": typeof staff_week_schedule_mutation;
  "staff/week_schedule/query": typeof staff_week_schedule_query;
  "storage/action": typeof storage_action;
  "tenant/mutation": typeof tenant_mutation;
  "tenant/plan/query": typeof tenant_plan_query;
  "tenant/query": typeof tenant_query;
  "tenant/referral/action": typeof tenant_referral_action;
  "tenant/referral/mutation": typeof tenant_referral_mutation;
  "tenant/referral/query": typeof tenant_referral_query;
  "tenant/subscription/action": typeof tenant_subscription_action;
  "tenant/subscription/mutation": typeof tenant_subscription_mutation;
  "tenant/subscription/query": typeof tenant_subscription_query;
  types: typeof types;
  "utils/auth": typeof utils_auth;
  "utils/helpers": typeof utils_helpers;
  "utils/validations": typeof utils_validations;
  "webhook_events/mutation": typeof webhook_events_mutation;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
