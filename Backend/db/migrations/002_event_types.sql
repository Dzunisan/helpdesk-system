-- 002: two more timeline facts (page 28, "every change writes a timeline event"):
--   comment_edited  - the author edited a message within 15 minutes (to_value = comment id,
--                     is_internal copied from the comment; the old wording is not kept)
--   feedback_given  - the requester rated a closed request (from_value = the previous rating when
--                     they changed it, to_value = the new rating 1-5, note = their comment)
ALTER TABLE ticket_event DROP CONSTRAINT ticket_event_type_check;
ALTER TABLE ticket_event ADD CONSTRAINT ticket_event_type_check CHECK (type IN (
  'created', 'claimed', 'assigned', 'status_changed', 'priority_changed',
  'approved', 'rejected', 'reopened', 'comment_deleted', 'comment_edited', 'feedback_given'));
