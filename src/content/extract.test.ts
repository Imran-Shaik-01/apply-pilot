import { afterEach, describe, expect, it, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { attemptCapture } from './extract'
import { getConfirmationTitle, isSubmissionMessage } from './normalizers'

const setPage = (structuredData: string[], href = 'https://jobs.example/roles/1?utm_source=newsletter') => {
  const scripts = structuredData.map((text) => `<script type="application/ld+json">${text}</script>`).join('')
  const dom = new JSDOM(`<html><head>${scripts}</head><body></body></html>`, { url: href })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
}

const setHtmlPage = (html: string, href = 'https://jobs.example/roles/1') => {
  const dom = new JSDOM(html, { url: href })
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('document', dom.window.document)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('attemptCapture', () => {
  it('extracts structured job details and canonicalizes its URL', () => {
    setPage([
      JSON.stringify({
        '@graph': [{
          '@type': 'JobPosting',
          title: 'Senior Engineer',
          hiringOrganization: { name: 'Northstar Labs' },
          identifier: { value: 'REQ-123' },
          jobLocation: { address: { addressLocality: 'Toronto' } },
          employmentType: 'FULL_TIME',
          jobLocationType: 'TELECOMMUTE',
          baseSalary: {
            currency: 'USD',
            value: { minValue: '80,000', maxValue: '100,000', unitText: 'YEAR' },
          },
        }],
      }),
    ])

    const result = attemptCapture()

    expect(result.isJobPage).toBe(true)
    expect(result.data).toMatchObject({
      id: 'jobs.example-REQ-123',
      jobId: 'REQ-123',
      title: 'Senior Engineer',
      company: 'Northstar Labs',
      url: 'https://jobs.example/roles/1',
      location: 'Toronto',
      employmentType: 'Full-time',
      workMode: 'Remote',
      salary: 'USD 80,000–100,000 YEAR',
    })
  })

  it('uses a same-origin structured posting URL only for the same path', () => {
    setPage([
      JSON.stringify({
        '@type': 'JobPosting',
        title: 'Senior Engineer',
        url: 'https://jobs.example/roles/1?currentJobId=REQ-42&utm_source=feed#overview',
        hiringOrganization: { name: 'Northstar' },
      }),
    ], 'https://jobs.example/roles/1?currentJobId=REQ-42&trk=mail#details')
    expect(attemptCapture().data.url)
      .toBe('https://jobs.example/roles/1?currentJobId=REQ-42')

    setPage([
      JSON.stringify({
        '@type': 'JobPosting',
        title: 'Senior Engineer',
        url: 'https://external.example/roles/1',
        hiringOrganization: { name: 'Northstar' },
      }),
    ], 'https://jobs.example/roles/1?utm_source=feed')
    expect(attemptCapture().data.url).toBe('https://jobs.example/roles/1')
  })

  it('skips malformed structured data and does not classify an ordinary page as a job', () => {
    setPage(['{ malformed'])

    expect(attemptCapture().isJobPage).toBe(false)
  })

  it('scopes work-mode heuristics to the job container, excluding sidebar listings', () => {
    setHtmlPage(`
      <main>
        <article class="job-detail">
          <h1 data-testid="job-title">Systems Engineer</h1>
          <div data-testid="company-name">Northstar</div>
          <div class="job-location">Toronto</div>
          <div data-testid="structured-job-summary"><div>Hybrid</div></div>
          <aside>
            <div data-testid="structured-job-summary"><div>Remote</div></div>
          </aside>
        </article>
      </main>
    `)

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      data: { workMode: 'Hybrid' },
    })
  })

  it('keeps the complete location while deriving work mode from that scoped value', () => {
    setHtmlPage(`
      <main>
        <article class="job-detail">
          <h1 data-testid="job-title">Systems Engineer</h1>
          <div data-testid="company-name">Northstar</div>
          <div class="job-location">Hybrid - Bengaluru, Karnataka, India</div>
        </article>
        <aside><div class="job-location">Remote - Other City</div></aside>
      </main>
    `)
    expect(attemptCapture().data).toMatchObject({
      location: 'Hybrid - Bengaluru, Karnataka, India',
      workMode: 'Hybrid',
    })
  })

  it('detects a confirmation page without treating recommendations as a job posting', () => {
    setHtmlPage(`
      <main>
        <h1>Apply Confirmation</h1>
        <p>You have successfully applied to 'Digital Specialist Engineer (Trainee)'</p>
        <aside><h2 data-testid="job-title">Recommended Software Developer</h2></aside>
      </main>
    `, 'https://jobs.example/myapply/saveApply')

    expect(attemptCapture().isJobPage).toBe(false)
    const text = "You have successfully applied to 'Digital Specialist Engineer (Trainee)'"
    expect(isSubmissionMessage(text)).toBe(true)
    expect(getConfirmationTitle(text)).toBe('Digital Specialist Engineer (Trainee)')
  })

  it('treats a successful application message as confirmation even without a heading', () => {
    setHtmlPage(`
      <main>
        <p>You have successfully applied to 'Software Engineer'.</p>
        <aside><h2 data-testid="job-title">Recommended role</h2></aside>
      </main>
    `, 'https://jobs.example/jobs/42')

    expect(attemptCapture().isJobPage).toBe(false)
  })

  it('extracts microdata without a site-specific selector', () => {
    setHtmlPage(`
      <main>
        <article itemscope itemtype="https://schema.org/JobPosting">
          <h1 itemprop="title">Platform Engineer</h1>
          <div itemprop="hiringOrganization" itemscope itemtype="https://schema.org/Organization">
            <span itemprop="name">Northstar Labs</span>
          </div>
          <div itemprop="jobLocation" itemscope itemtype="https://schema.org/Place">
            <span itemprop="addressLocality">Toronto</span>
            <span itemprop="addressRegion">ON</span>
          </div>
          <meta itemprop="employmentType" content="FULL_TIME">
          <meta itemprop="jobLocationType" content="TELECOMMUTE">
          <meta itemprop="baseSalary" content="USD 80,000 per year">
        </article>
      </main>
    `, 'https://careers.example.test/jobs/42')

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      strongSignal: true,
      data: {
        title: 'Platform Engineer',
        company: 'Northstar Labs',
        location: 'Toronto, ON',
        employmentType: 'Full-time',
        workMode: 'Remote',
        salary: 'USD 80,000 per year',
      },
    })
  })

  it('extracts RDFa JobPosting properties from the semantic markup layer', () => {
    setHtmlPage(`
      <main>
        <article typeof="https://schema.org/JobPosting">
          <h1 property="title">Security Engineer</h1>
          <div property="hiringOrganization" typeof="https://schema.org/Organization">
            <span property="name">Northstar Labs</span>
          </div>
          <span property="employmentType">CONTRACTOR</span>
        </article>
      </main>
    `, 'https://careers.example.test/jobs/contract-role')

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      strongSignal: true,
      data: {
        title: 'Security Engineer',
        company: 'Northstar Labs',
        employmentType: 'Contract',
      },
    })
  })

  it('corroborates embedded app records and ignores recommended job decoys', () => {
    setHtmlPage(`
      <html>
        <head>
          <title>Software Engineer | Example</title>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"jobs":[
              {"id":"recommended-7","title":"Recommended Analyst","companyName":"Other Co"},
              {"id":"5061221","title":"Software Engineer","companyName":"Opland","location":"Remote, US","salary":"USD 80,000–100,000 YEAR"}
            ]}}
          </script>
        </head>
        <body><main><h1>Software Engineer</h1></main></body>
      </html>
    `, 'https://jobs.example.test/jobs/5061221-software-engineer')

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      strongSignal: true,
      data: {
        title: 'Software Engineer',
        company: 'Opland',
        location: 'Remote, US',
        salary: 'USD 80,000–100,000 YEAR',
        workMode: 'Remote',
      },
    })
  })

  it('extracts labeled semantic fields and company links generically', () => {
    setHtmlPage(`
      <main>
        <article>
          <header><h1>Data Engineer</h1></header>
          <a href="/companies/northstar">Northstar Labs</a>
          <button>Apply now</button>
          <dl>
            <dt>Location</dt><dd>Montreal, QC</dd>
            <dt>Work mode</dt><dd>Hybrid</dd>
            <dt>Salary</dt><dd>CAD 90,000–110,000 per year</dd>
            <dt>Employment type</dt><dd>Full-time</dd>
          </dl>
          <section><p>${'Build reliable systems for customers. '.repeat(20)}</p></section>
        </article>
      </main>
    `, 'https://careers.example.test/jobs/data-engineer')

    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      strongSignal: false,
      data: {
        title: 'Data Engineer',
        company: 'Northstar Labs',
        location: 'Montreal, QC',
        workMode: 'Hybrid',
        salary: 'CAD 90,000–110,000 per year',
        employmentType: 'Full-time',
      },
    })
  })

  it('parses a title-only page pattern and rejects generic title fallbacks', () => {
    setHtmlPage('<html><head><title>Software Engineer at Acme | Example</title></head><body></body></html>',
      'https://jobs.example.test/jobs/42')
    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      data: { title: 'Software Engineer', company: 'Acme' },
    })

    setHtmlPage('<html><head><title>Designer at Acme • Remote | Example</title></head><body></body></html>',
      'https://jobs.example.test/jobs/43')
    expect(attemptCapture().data).toMatchObject({
      title: 'Designer',
      company: 'Acme',
    })

    for (const title of [
      'Jobs',
      'Careers - Home',
      `${'Senior role '.repeat(20)}at Acme`,
    ]) {
      setHtmlPage(`<html><head><title>${title}</title></head><body></body></html>`,
        'https://jobs.example.test/jobs/42')
      expect(attemptCapture().isJobPage).toBe(false)
    }
  })

  it('falls through to the next valid layer independently for each field', () => {
    setHtmlPage(`
      <html><head>
        <script type="application/ld+json">
          {"@type":"JobPosting","title":"Jobs","hiringOrganization":{"name":"Northstar Labs"},
           "jobLocation":"This sentence is not a location. It has another sentence.",
           "employmentType":"Other","baseSalary":"Competitive compensation","jobLocationType":"Flexible"}
        </script>
      </head><body>
        <main><article>
          <h1>Software Engineer</h1>
          <dl>
            <dt>Location</dt><dd>Toronto, ON</dd>
            <dt>Employment type</dt><dd>Full-time</dd>
            <dt>Salary</dt><dd>USD 80,000–100,000 YEAR</dd>
            <dt>Work mode</dt><dd>Hybrid</dd>
          </dl>
        </article></main>
      </body></html>
    `, 'https://jobs.example.test/jobs/42')

    expect(attemptCapture().data).toMatchObject({
      title: 'Software Engineer',
      company: 'Northstar Labs',
      location: 'Toronto, ON',
      employmentType: 'Full-time',
      salary: 'USD 80,000–100,000 YEAR',
      workMode: 'Hybrid',
    })
  })

  it('accepts a company-owned site name but rejects an aggregator brand', () => {
    setHtmlPage(`
      <html><head><meta property="og:site_name" content="Acme"></head>
      <body><main><h1>Software Engineer</h1></main></body></html>
    `, 'https://careers.acmejobs.com/jobs/42')
    expect(attemptCapture().data.company).toBe('Acme')

    setHtmlPage(`
      <html><head><meta property="og:site_name" content="Unknown Aggregator"></head>
      <body><main><h1>Software Engineer</h1></main></body></html>
    `, 'https://unknownaggregator.example/jobs/42')
    expect(attemptCapture().data.company).toBe('')
  })

  it('keeps recommendations outside the job scope and allows partial captures', () => {
    setHtmlPage(`
      <main>
        <article>
          <h1>Systems Engineer</h1>
          <a href="/companies/northstar">Northstar</a>
          <dl><dt>Location</dt><dd>Toronto</dd></dl>
          <section>${'Job responsibilities and requirements. '.repeat(20)}</section>
        </article>
        <aside>
          <h2>Other jobs</h2>
          <p>Remote Hybrid</p><p>Salary USD 200,000</p>
        </aside>
        <section>
          <h2>Jobs you might like</h2>
          <div data-testid="job-title">Another Engineer</div>
          <div>Remote</div><div>USD 300,000</div>
        </section>
      </main>
    `, 'https://jobs.example.test/jobs/42')
    expect(attemptCapture().data).toMatchObject({
      title: 'Systems Engineer',
      company: 'Northstar',
      location: 'Toronto',
    })
    expect(attemptCapture().data.workMode).toBeUndefined()
    expect(attemptCapture().data.salary).toBeUndefined()

    setHtmlPage('<main><h1>Systems Engineer</h1></main>', 'https://jobs.example.test/jobs/42')
    expect(attemptCapture()).toMatchObject({
      isJobPage: true,
      data: { title: 'Systems Engineer', company: '' },
    })
    setHtmlPage('<main><p>Ordinary page</p></main>', 'https://jobs.example.test/jobs/42')
    expect(attemptCapture().isJobPage).toBe(false)
  })

  it('validates labeled values instead of copying sentence-like text', () => {
    setHtmlPage(`
      <main>
        <article>
          <h1>Operations Intern</h1>
          <a href="/companies/acme">Acme</a>
          <dl>
            <dt>Employment type</dt><dd>Unpaid internship with potential for a bonus after one year.</dd>
            <dt>Work mode</dt><dd>Remote or hybrid, based on the team.</dd>
            <dt>Salary</dt><dd>Competitive compensation based on experience</dd>
            <dt>Location</dt><dd>Toronto. The role also travels across Canada.</dd>
          </dl>
        </article>
      </main>
    `, 'https://careers.acmejobs.com/jobs/operations-intern')

    expect(attemptCapture().data).toMatchObject({
      employmentType: undefined,
      workMode: undefined,
      salary: undefined,
      location: undefined,
    })
  })

  it('keeps portal names and hostname literals out of the generic engine', () => {
    const coreSources = ['extract.ts', 'normalizers.ts']
      .map((file) => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8'))
      .join('\n')
    const portalNames =
      /\b(?:linkedin|indeed|naukri|wellfound|workday|greenhouse|lever|ashby|smartrecruiters|workable|glassdoor|foundit|internshala|ziprecruiter|monster|myworkdayjobs)\b/i

    expect(portalNames.test(coreSources)).toBe(false)
    expect(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(coreSources)).toBe(false)
  })
})
