-- DropForeignKey
ALTER TABLE "public"."agent_configurations" DROP CONSTRAINT "agent_configurations_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."agent_permissions" DROP CONSTRAINT "agent_permissions_agent_configuration_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."agent_permissions" DROP CONSTRAINT "agent_permissions_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."agent_usage" DROP CONSTRAINT "agent_usage_agent_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."agent_usage" DROP CONSTRAINT "agent_usage_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."agent_usage" DROP CONSTRAINT "agent_usage_workflow_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."api_configurations" DROP CONSTRAINT "api_configurations_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_global_variables" DROP CONSTRAINT "data_global_variables_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_table_fields" DROP CONSTRAINT "data_table_fields_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_table_fields" DROP CONSTRAINT "data_table_fields_table_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_table_records" DROP CONSTRAINT "data_table_records_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_table_records" DROP CONSTRAINT "data_table_records_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_table_records" DROP CONSTRAINT "data_table_records_table_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_tables" DROP CONSTRAINT "data_tables_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."data_tables" DROP CONSTRAINT "data_tables_primary_field_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files" DROP CONSTRAINT "files_uploaded_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."files_metadata_keys" DROP CONSTRAINT "files_metadata_keys_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files_metadata_values" DROP CONSTRAINT "files_metadata_values_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files_metadata_values" DROP CONSTRAINT "files_metadata_values_files_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."files_metadata_values" DROP CONSTRAINT "files_metadata_values_metadata_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folder_permissions" DROP CONSTRAINT "folder_permissions_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folder_permissions" DROP CONSTRAINT "folder_permissions_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folder_permissions" DROP CONSTRAINT "folder_permissions_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folder_permissions" DROP CONSTRAINT "folder_permissions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folders" DROP CONSTRAINT "folders_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."folders" DROP CONSTRAINT "folders_parent_folder_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."invitations" DROP CONSTRAINT "invitations_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."invitations" DROP CONSTRAINT "invitations_invited_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."profile_admin_roles" DROP CONSTRAINT "profile_admin_roles_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."profile_group_members" DROP CONSTRAINT "profile_group_members_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."profile_group_members" DROP CONSTRAINT "profile_group_members_profile_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."profile_groups" DROP CONSTRAINT "profile_groups_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."profile_groups" DROP CONSTRAINT "profile_groups_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."profiles" DROP CONSTRAINT "profiles_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_company" DROP CONSTRAINT "user_company_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."user_company" DROP CONSTRAINT "user_company_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_categories" DROP CONSTRAINT "workflow_categories_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_categories" DROP CONSTRAINT "workflow_categories_parent_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_connections" DROP CONSTRAINT "workflow_connections_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_connections" DROP CONSTRAINT "workflow_connections_source_step_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_connections" DROP CONSTRAINT "workflow_connections_target_step_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_connections" DROP CONSTRAINT "workflow_connections_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_data" DROP CONSTRAINT "workflow_execution_data_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_data" DROP CONSTRAINT "workflow_execution_data_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_log" DROP CONSTRAINT "workflow_execution_log_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_log" DROP CONSTRAINT "workflow_execution_log_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_log" DROP CONSTRAINT "workflow_execution_log_step_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_steps" DROP CONSTRAINT "workflow_execution_steps_assigned_to_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_steps" DROP CONSTRAINT "workflow_execution_steps_assigned_to_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_steps" DROP CONSTRAINT "workflow_execution_steps_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_steps" DROP CONSTRAINT "workflow_execution_steps_execution_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_execution_steps" DROP CONSTRAINT "workflow_execution_steps_step_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_executions" DROP CONSTRAINT "workflow_executions_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_executions" DROP CONSTRAINT "workflow_executions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_executions" DROP CONSTRAINT "workflow_executions_current_step_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_executions" DROP CONSTRAINT "workflow_executions_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_files" DROP CONSTRAINT "workflow_files_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_files" DROP CONSTRAINT "workflow_files_file_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_files" DROP CONSTRAINT "workflow_files_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_permissions" DROP CONSTRAINT "workflow_permissions_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_permissions" DROP CONSTRAINT "workflow_permissions_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_permissions" DROP CONSTRAINT "workflow_permissions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_permissions" DROP CONSTRAINT "workflow_permissions_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_statuses" DROP CONSTRAINT "workflow_statuses_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_statuses" DROP CONSTRAINT "workflow_statuses_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_steps" DROP CONSTRAINT "workflow_steps_assigned_to_group_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_steps" DROP CONSTRAINT "workflow_steps_assigned_to_user_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_steps" DROP CONSTRAINT "workflow_steps_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflow_steps" DROP CONSTRAINT "workflow_steps_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflows" DROP CONSTRAINT "workflows_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflows" DROP CONSTRAINT "workflows_company_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."workflows" DROP CONSTRAINT "workflows_default_status_id_fkey";

-- AddForeignKey
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_configurations" ADD CONSTRAINT "agent_configurations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."agent_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_permissions" ADD CONSTRAINT "agent_permissions_agent_configuration_id_fkey" FOREIGN KEY ("agent_configuration_id") REFERENCES "public"."agent_configurations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_permissions" ADD CONSTRAINT "agent_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."api_configurations" ADD CONSTRAINT "api_configurations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_global_variables" ADD CONSTRAINT "data_global_variables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_tables" ADD CONSTRAINT "data_tables_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_tables" ADD CONSTRAINT "data_tables_primary_field_id_fkey" FOREIGN KEY ("primary_field_id") REFERENCES "public"."data_table_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_table_fields" ADD CONSTRAINT "data_table_fields_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."data_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_table_fields" ADD CONSTRAINT "data_table_fields_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_table_records" ADD CONSTRAINT "data_table_records_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "public"."data_tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_table_records" ADD CONSTRAINT "data_table_records_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."data_table_records" ADD CONSTRAINT "data_table_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files" ADD CONSTRAINT "files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files" ADD CONSTRAINT "files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files_metadata_keys" ADD CONSTRAINT "files_metadata_keys_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files_metadata_values" ADD CONSTRAINT "files_metadata_values_files_id_fkey" FOREIGN KEY ("files_id") REFERENCES "public"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files_metadata_values" ADD CONSTRAINT "files_metadata_values_metadata_id_fkey" FOREIGN KEY ("metadata_id") REFERENCES "public"."files_metadata_keys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."files_metadata_values" ADD CONSTRAINT "files_metadata_values_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profile_groups" ADD CONSTRAINT "profile_groups_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profile_groups" ADD CONSTRAINT "profile_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_permissions" ADD CONSTRAINT "folder_permissions_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_permissions" ADD CONSTRAINT "folder_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_permissions" ADD CONSTRAINT "folder_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."profile_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folder_permissions" ADD CONSTRAINT "folder_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profile_admin_roles" ADD CONSTRAINT "profile_admin_roles_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profile_group_members" ADD CONSTRAINT "profile_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."profile_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."profile_group_members" ADD CONSTRAINT "profile_group_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_company" ADD CONSTRAINT "user_company_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_company" ADD CONSTRAINT "user_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_categories" ADD CONSTRAINT "workflow_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."workflow_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_categories" ADD CONSTRAINT "workflow_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflows" ADD CONSTRAINT "workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflows" ADD CONSTRAINT "workflows_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."workflow_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflows" ADD CONSTRAINT "workflows_default_status_id_fkey" FOREIGN KEY ("default_status_id") REFERENCES "public"."workflow_statuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_statuses" ADD CONSTRAINT "workflow_statuses_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_statuses" ADD CONSTRAINT "workflow_statuses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_steps" ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_steps" ADD CONSTRAINT "workflow_steps_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_steps" ADD CONSTRAINT "workflow_steps_assigned_to_group_id_fkey" FOREIGN KEY ("assigned_to_group_id") REFERENCES "public"."profile_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_steps" ADD CONSTRAINT "workflow_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_executions" ADD CONSTRAINT "workflow_executions_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_executions" ADD CONSTRAINT "workflow_executions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_executions" ADD CONSTRAINT "workflow_executions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_assigned_to_group_id_fkey" FOREIGN KEY ("assigned_to_group_id") REFERENCES "public"."profile_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_steps" ADD CONSTRAINT "workflow_execution_steps_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_usage" ADD CONSTRAINT "agent_usage_workflow_execution_id_fkey" FOREIGN KEY ("workflow_execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_usage" ADD CONSTRAINT "agent_usage_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agent_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_usage" ADD CONSTRAINT "agent_usage_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_connections" ADD CONSTRAINT "workflow_connections_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_connections" ADD CONSTRAINT "workflow_connections_source_step_id_fkey" FOREIGN KEY ("source_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_connections" ADD CONSTRAINT "workflow_connections_target_step_id_fkey" FOREIGN KEY ("target_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_connections" ADD CONSTRAINT "workflow_connections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_data" ADD CONSTRAINT "workflow_execution_data_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_data" ADD CONSTRAINT "workflow_execution_data_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_log" ADD CONSTRAINT "workflow_execution_log_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_log" ADD CONSTRAINT "workflow_execution_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_execution_log" ADD CONSTRAINT "workflow_execution_log_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "public"."workflow_execution_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_files" ADD CONSTRAINT "workflow_files_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_files" ADD CONSTRAINT "workflow_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_files" ADD CONSTRAINT "workflow_files_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_permissions" ADD CONSTRAINT "workflow_permissions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_permissions" ADD CONSTRAINT "workflow_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_permissions" ADD CONSTRAINT "workflow_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."profile_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."workflow_permissions" ADD CONSTRAINT "workflow_permissions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
