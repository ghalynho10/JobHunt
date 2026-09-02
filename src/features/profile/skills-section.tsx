import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";

import { CONTROLS, HEADINGS } from "./copy";
import { SectionCard } from "./section-card";
import { SkillsForm } from "./skills-form";
import type { Skill } from "./queries";

/**
 * Skills, as a view or as its own edit form (spec 0010, AC-5, AC-6, AC-18).
 *
 * THE CALLER'S OWN LIST ONLY, WITH NO MATCHED OR MISSING DISTINCTION (AC-18).
 * Every chip is `matched`, which is the filled half of the fill versus outline
 * grammar, because on this page a skill is something the person has rather than
 * something a job asked for. The matched against missing split belongs to
 * feature 14's scoring output, against a specific posting.
 */

interface SkillsSectionProps {
  readonly skills: readonly Skill[];
  readonly editing: boolean;
}

export function SkillsSection({ skills, editing }: SkillsSectionProps) {
  if (editing) {
    return (
      <SectionCard heading={HEADINGS.skills}>
        {/* One per line, in the order the reader last saw them on the page. */}
        <SkillsForm skills={skills.map((skill) => skill.name).join("\n")} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      heading={HEADINGS.skills}
      control={
        <Button
          variant="tertiary"
          size="sm"
          href="/profile?edit=skills"
          label="Edit skills"
        >
          {CONTROLS.edit}
        </Button>
      }
    >
      {skills.length === 0 ? (
        <Text className="text-muted">
          Not set yet. Add the skills you would want a job to use.
        </Text>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            /**
             * Keyed on the row id, not on the name. Two saves apart the same
             * name is a different row, and a name is not stable enough to be a
             * key for a list that is rebuilt by a diff.
             */
            <li key={skill.id}>
              <Chip state="matched">{skill.name}</Chip>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
