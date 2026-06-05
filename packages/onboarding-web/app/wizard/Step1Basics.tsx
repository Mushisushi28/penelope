'use client'

import { useWizard } from './WizardContext'
import { StepNav } from '@/app/components/StepNav'

export function Step1Basics() {
  const { state, setBusiness, next, back } = useWizard()
  const { business } = state

  const canContinue =
    business.name.trim().length > 0 &&
    business.ownerName.trim().length > 0 &&
    business.location.trim().length > 0

  return (
    <div className="animate-slide-up">
      <h2 className="display-serif text-3xl text-loom-700 mb-1">Tell us about your business</h2>
      <p className="text-sm text-charcoal-500 mb-8">
        This becomes the identity layer for all your customer-facing communications.
      </p>

      <div className="space-y-5">
        {/* Required fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="bizName" className="input-label">
              Business name <span className="text-shuttle-500">*</span>
            </label>
            <input
              id="bizName"
              type="text"
              value={business.name}
              onChange={(e) => setBusiness({ name: e.target.value })}
              className="input-field"
              placeholder="Dobson Headlight Restoration"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="ownerName" className="input-label">
              Owner name <span className="text-shuttle-500">*</span>
            </label>
            <input
              id="ownerName"
              type="text"
              value={business.ownerName}
              onChange={(e) => setBusiness({ ownerName: e.target.value })}
              className="input-field"
              placeholder="Isaac Dobson"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="location" className="input-label">
            City / Service area <span className="text-shuttle-500">*</span>
          </label>
          <input
            id="location"
            type="text"
            value={business.location}
            onChange={(e) => setBusiness({ location: e.target.value })}
            className="input-field"
            placeholder="Calgary, AB"
            required
          />
        </div>

        {/* Optional fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-bone-200">
          <div>
            <label htmlFor="phone" className="input-label">Phone (optional)</label>
            <input
              id="phone"
              type="tel"
              value={business.phone}
              onChange={(e) => setBusiness({ phone: e.target.value })}
              className="input-field"
              placeholder="+1 403-555-0100"
            />
          </div>
          <div>
            <label htmlFor="email" className="input-label">Email (optional)</label>
            <input
              id="email"
              type="email"
              value={business.email}
              onChange={(e) => setBusiness({ email: e.target.value })}
              className="input-field"
              placeholder="hello@mybusiness.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="website" className="input-label">Website (optional)</label>
          <input
            id="website"
            type="url"
            value={business.website}
            onChange={(e) => setBusiness({ website: e.target.value })}
            className="input-field"
            placeholder="https://mybusiness.com"
          />
        </div>

        <div>
          <label htmlFor="tagline" className="input-label">Tagline (optional)</label>
          <input
            id="tagline"
            type="text"
            value={business.tagline}
            onChange={(e) => setBusiness({ tagline: e.target.value })}
            className="input-field"
            placeholder="One sentence that says what you do"
          />
          <p className="text-xs text-charcoal-400 mt-1">
            Penelope will use this when introducing your business to customers.
          </p>
        </div>
      </div>

      <StepNav
        currentStep={1}
        totalSteps={5}
        onBack={back}
        onNext={next}
        nextDisabled={!canContinue}
      />
    </div>
  )
}
