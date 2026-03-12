# Exemples Clean Architecture

Exemples concrets tirés du projet Solife v2.

---

## Factory

```typescript
// modules/spamDetection/domain/factories/spamFlagFactory.ts
import type {
	SpamFlag,
	SpamIndicator,
	SpamStatus,
} from "@/modules/spamDetection/domain/types/SpamTypes";

interface CreateSpamFlagInput {
	targetId: string;
	targetType: "member" | "contact" | "membership";
	totalScore: number;
	indicators: SpamIndicator[];
	threshold?: number;
}

export const createSpamFlag = (
	input: CreateSpamFlagInput,
): Omit<SpamFlag, "id" | "createdAt" | "updatedAt"> => {
	return {
		targetId: input.targetId,
		targetType: input.targetType,
		status: "pending_review",
		totalScore: input.totalScore,
		threshold: input.threshold ?? 50,
		indicators: input.indicators,
		reviewedBy: undefined,
		reviewedAt: undefined,
	};
};

export const updateSpamFlagStatus = (
	flag: SpamFlag,
	status: SpamStatus,
	reviewedBy?: string,
): SpamFlag => {
	return {
		...flag,
		status,
		reviewedBy: reviewedBy ?? flag.reviewedBy,
		reviewedAt: status !== "pending_review" ? new Date() : flag.reviewedAt,
		updatedAt: new Date(),
	};
};
```

---

## Use Case

```typescript
// modules/spamDetection/application/usecases/ValidateSubmissionUseCase.ts
import type { ISpamScoringService } from "@/modules/spamDetection/application/ports/services/ISpamScoringService";
import type { SpamIndicator } from "@/modules/spamDetection/domain/types/SpamTypes";

export interface SubmissionValidationInput {
	honeypotField?: string;
	firstName?: string;
	lastName?: string;
	name?: string;
	email?: string;
	message?: string;
}

export type SpamDetectionReason = "honeypot" | "spam_score";

export interface SubmissionValidationResult {
	isSpam: boolean;
	reason?: SpamDetectionReason;
	score?: number;
	indicators?: SpamIndicator[];
}

export class ValidateSubmissionUseCase {
	constructor(private readonly spamScoringService: ISpamScoringService) {}

	execute(input: SubmissionValidationInput): SubmissionValidationResult {
		if (input.honeypotField && input.honeypotField.length > 0) {
			return {
				isSpam: true,
				reason: "honeypot",
			};
		}

		const analysisResult = this.spamScoringService.analyze({
			firstName: input.firstName,
			lastName: input.lastName,
			name: input.name,
			email: input.email,
			message: input.message,
		});

		if (analysisResult.isSuspicious) {
			return {
				isSpam: true,
				reason: "spam_score",
				score: analysisResult.totalScore,
				indicators: analysisResult.indicators,
			};
		}

		return {
			isSpam: false,
		};
	}
}
```

---

## Port (Interface)

```typescript
// modules/spamDetection/application/ports/services/ISpamScoringService.ts
import type {
	SpamAnalysisResult,
	SpamCheckInput,
} from "@/modules/spamDetection/domain/types/SpamTypes";

export interface ISpamScoringService {
	analyze(input: SpamCheckInput): SpamAnalysisResult;
}
```

---

## Service (Infrastructure Implementation)

```typescript
// modules/spamDetection/infrastructure/services/SpamScoringService.ts
import type { ISpamScoringService } from "@/modules/spamDetection/application/ports/services/ISpamScoringService";
import type {
	SpamAnalysisResult,
	SpamCheckInput,
} from "@/modules/spamDetection/domain/types/SpamTypes";
import { DEFAULT_SPAM_THRESHOLD } from "@/modules/spamDetection/domain/types/SpamTypes";
import {
	analyzeSpamIndicators,
	calculateTotalScore,
} from "@/modules/spamDetection/domain/validators/nameSpamValidator";

export class SpamScoringService implements ISpamScoringService {
	private readonly threshold: number;

	constructor(threshold?: number) {
		this.threshold = threshold ?? DEFAULT_SPAM_THRESHOLD;
	}

	analyze(input: SpamCheckInput): SpamAnalysisResult {
		const indicators = analyzeSpamIndicators(input);
		const totalScore = calculateTotalScore(indicators);

		return {
			totalScore,
			threshold: this.threshold,
			isSuspicious: totalScore >= this.threshold,
			indicators,
		};
	}
}
```

---

## Hook (Presentation Layer)

```typescript
// modules/membership/presentation/hooks/useMembershipForm.ts
"use client";

import { useState } from "react";
import { submitMembershipForm } from "@/modules/membership/application/usecases/submitMembershipForm";
import { createDefaultMembershipFormData } from "@/modules/membership/domain/factories/membershipFactory";
import type {
	IFormations,
	IMembershipFormData,
	MembershipFormSubmitResult,
} from "@/modules/membership/domain/types/Membership";
import { frenchDate } from "@/modules/membership/domain/utils/frenchDate";

export const useMembershipForm = () => {
	const [formData, setFormData] = useState<IMembershipFormData>(
		createDefaultMembershipFormData(),
	);
	const [isLoading, setIsLoading] = useState(false);

	const updateIdentity = (
		key: keyof IMembershipFormData["candidateIdentity"],
		value: string,
	) => {
		if (key === "birthDate") {
			setFormData({
				...formData,
				candidateIdentity: {
					...formData.candidateIdentity,
					[key]: frenchDate(value),
				},
			});
			return;
		}

		setFormData({
			...formData,
			candidateIdentity: {
				...formData.candidateIdentity,
				[key]: value,
			},
		});
	};

	const handleSubmit = async (): Promise<MembershipFormSubmitResult> => {
		setIsLoading(true);
		try {
			const result = await submitMembershipForm(formData);
			return result;
		} finally {
			setIsLoading(false);
		}
	};

	return {
		formData,
		isLoading,
		updateIdentity,
		handleSubmit,
	};
};
```

---

## Test (Detroit School)

```typescript
// modules/__test__/domain/membership/usecases/submitMembershipForm.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitMembershipForm } from "@/modules/membership/application/usecases/submitMembershipForm";
import { createDefaultMembershipFormData } from "@/modules/membership/domain/factories/membershipFactory";
import type { IMembershipFormData } from "@/modules/membership/domain/types/Membership";

global.fetch = vi.fn();

function mockFetchJson({ ok, jsonData }: { ok: boolean; jsonData: unknown }) {
	(global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
		ok,
		json: vi.fn().mockResolvedValue(jsonData),
	});
}

describe("submitMembershipForm", () => {
	let mockFormData: IMembershipFormData;

	beforeEach(() => {
		vi.clearAllMocks();
		mockFormData = createDefaultMembershipFormData();
		mockFormData.candidateIdentity.firstName = "John";
		mockFormData.candidateIdentity.lastName = "Doe";
	});

	it("should submit form data successfully", async () => {
		mockFetchJson({
			ok: true,
			jsonData: { message: "Candidature envoyée avec succès" },
		});

		const result = await submitMembershipForm(mockFormData);

		expect(global.fetch).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify(mockFormData),
			}),
		);
		expect(result.success).toBe(true);
	});

	it("should handle API error response", async () => {
		mockFetchJson({ ok: false, jsonData: { message: "Erreur serveur" } });

		const result = await submitMembershipForm(mockFormData);

		expect(result.success).toBe(false);
	});

	it("should validate form data before submission", async () => {
		const invalidData = {} as unknown as IMembershipFormData;

		const result = await submitMembershipForm(invalidData);

		expect(global.fetch).not.toHaveBeenCalled();
		expect(result.success).toBe(false);
	});
});
```

---

## Structure d'un Bounded Context Solife

```
modules/spamDetection/
├── domain/
│   ├── types/
│   │   └── SpamTypes.ts              # Types et interfaces
│   ├── factories/
│   │   └── spamFlagFactory.ts        # Création d'entités
│   └── validators/
│       └── nameSpamValidator.ts      # Règles métier
│
├── application/
│   ├── ports/
│   │   ├── services/
│   │   │   └── ISpamScoringService.ts    # Interface service
│   │   ├── gateways/
│   │   │   └── IRateLimiterGateway.ts    # Interface gateway
│   │   └── repositories/
│   │       └── ISpamFlagRepository.ts    # Interface repo
│   ├── dto/
│   │   └── SpamFlagDTO.ts
│   └── usecases/
│       ├── ValidateSubmissionUseCase.ts
│       ├── AnalyzeSpamScoreUseCase.ts
│       └── GetFlaggedMembersUseCase.ts
│
├── infrastructure/
│   ├── services/
│   │   └── SpamScoringService.ts     # Implémentation
│   ├── gateways/
│   │   └── InMemoryRateLimiterGateway.ts
│   └── repositories/
│       └── PrismaSpamFlagRepository.ts
│
└── presentation/
    └── hooks/
        ├── useHoneypot.ts
        ├── useRateLimiter.ts
        └── useSuspiciousMembers.ts
```
