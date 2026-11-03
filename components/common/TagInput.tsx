'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Label } from '@/components/ui/label'
import { Tag, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'

type TagInputProps = {
  tags: string[]
  setTagsAction: (tags: string[]) => void
  errors?: { message?: string }
  title?: string
}

const TagInput = ({ tags, setTagsAction, errors, title }: TagInputProps) => {
  const [input, setInput] = useState('')
  const t = useTranslations('common.tagInput')

  // タグ追加
  const addTag = (
    e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLInputElement>
  ) => {
    e.preventDefault()
    if (!input.trim()) return

    const tagsToAdd = input
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter((t) => t && !tags.includes(t))

    if (tags.length + tagsToAdd.length > 5) {
      toast.warning(t('maxTagsWarning'))
      return
    }

    const updated = [...tags, ...tagsToAdd].slice(0, 5)
    setTagsAction(updated)
    setInput('')
  }

  // タグ削除
  const removeTag = (index: number) => {
    const updated = [...tags]
    updated.splice(index, 1)
    setTagsAction(updated)
  }

  return (
    <div>
      <Label htmlFor="tags" className="flex items-center gap-2 text-sm mb-2">
        <Tag size={16} className="text-muted-foreground" />
        {title ?? t('title')} {t('maxTags')}
      </Label>

      <div className="flex flex-wrap gap-2 mb-2 max-w-full overflow-x-auto">
        {tags.map((tag, idx) => (
          <div
            key={idx}
            className="p-1 px-2 bg-primary text-primary-foreground border text-xs tracking-wide border-primary rounded-md flex items-center gap-1 cursor-pointer hover:opacity-80"
            onClick={() => removeTag(idx)}
          >
            {tag} <X size={16} className="text-primary-foreground  ml-1" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 w-full">
        <Input
          id="tags"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTag(e)}
          placeholder={t('placeholder')}
          className="flex-1 py-2 px-1  border border-ring rounded-md text-base focus:outline-none focus:border-primary transition-colors min-w-0"
          disabled={tags.length >= 5}
        />
        <Button
          variant="default"
          onClick={(e) => addTag(e)}
          disabled={tags.length >= 5 || !input.trim()}
          className="text-sm w-auto"
        >
          {t('addButton')}
        </Button>
      </div>
      {errors && (
        <p className="mt-1 text-sm text-destructive flex items-center gap-1">
          <AlertCircle size={14} />
          {errors.message}
        </p>
      )}
    </div>
  )
}

export default TagInput
