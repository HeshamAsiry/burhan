alter table public.test_questions
drop constraint if exists test_questions_question_type_check;

alter table public.test_questions
add constraint test_questions_question_type_check
check (
  question_type = any (array[
    'recite_range',
    'recite_following',
    'anchor_recall',
    'mutashabihat',
    'identify_surah',
    'mcq',
    'fragment_recall'
  ])
);
