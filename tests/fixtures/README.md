# Saved job-page fixtures

Save each portal's public job page with **File > Save Page As > Webpage, HTML only**.
Name the files `<site>-job.html`, for example `wellfound-job.html`. Keep personal
information and logged-in account data out of fixtures.

Add the page URL either as a sibling `<site>-job.url` file or as an HTML comment
at the top of the file:

```html
<!-- URL: https://jobs.example/jobs/123 -->
```

Add `<site>-job.expected.json` with all fields, using an empty string when the page
does not expose a value:

```json
{
  "title": "Software Engineer",
  "company": "Acme",
  "jobUrl": "https://jobs.example/jobs/123",
  "location": "Toronto, ON",
  "workMode": "",
  "salary": "",
  "employmentType": "Full-time"
}
```

The fixture matrix test automatically runs every `*-job.html` file against its
matching expected JSON. Confirmation pages should use `<site>-confirmation.html`
and be covered by confirmation-detection tests rather than the job-page matrix.
