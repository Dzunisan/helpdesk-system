-- 004: one more timeline fact (page 28, "every change writes a timeline event"):
--   attachment_removed - S14: the uploader removed a file within 15 minutes (to_value = attachment
--                        id, note = file name, is_internal = the same visibility as its `attached`
--                        event, so a removed internal file never reaches the requester)
-- Never edit it once applied: add 005_... instead.
ALTER TABLE ticket_event DROP CONSTRAINT ticket_event_type_check;
ALTER TABLE ticket_event ADD CONSTRAINT ticket_event_type_check CHECK (type IN (
  'created', 'claimed', 'assigned', 'status_changed', 'priority_changed',
  'approved', 'rejected', 'reopened', 'comment_deleted', 'comment_edited', 'feedback_given',
  'department_changed', 'attached', 'attachment_removed'));
