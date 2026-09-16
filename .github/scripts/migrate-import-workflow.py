from pathlib import Path

path = Path('.github/workflows/import-newsletter-article.yml')
text = path.read_text(encoding='utf-8')

old_permissions = '''permissions:
  contents: write
  actions: write
'''
new_permissions = '''permissions:
  contents: write
  pull-requests: write
'''
if old_permissions not in text:
    raise SystemExit('Expected permissions block was not found.')
text = text.replace(old_permissions, new_permissions, 1)

old_job_header = '''  import:
    name: Import article metadata
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
'''
new_job_header = '''  import:
    name: Import article metadata
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      AUTOMATION_BRANCH_PREFIX: automation/import-newsletter-article

    steps:
      - name: Checkout repository
        uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
        with:
          ref: main
          fetch-depth: 0
          persist-credentials: false
'''
if old_job_header not in text:
    raise SystemExit('Expected job header was not found.')
text = text.replace(old_job_header, new_job_header, 1)

text = text.replace(
    '> O artigo foi importado para o JSON. A homepage será sincronizada em seguida.',
    '> O artigo foi importado para o JSON. A homepage será renderizada no mesmo Pull Request.',
    1,
)
text = text.replace(
    'Nenhum arquivo foi alterado e a sincronização da homepage não foi chamada.',
    'Nenhum arquivo foi alterado e nenhum Pull Request foi criado.',
    1,
)

marker = '      - name: Commit JSON when changed\n'
index = text.find(marker)
if index < 0:
    raise SystemExit('Expected publication block was not found.')

new_tail = r'''      - name: Render homepage with imported article
        run: python3 .github/scripts/render-newsletter.py

      - name: Validate generated content
        id: validation
        shell: bash
        run: |
          article_count="$(python3 - <<'PY'
          from pathlib import Path

          html = Path("index.html").read_text(encoding="utf-8")
          start = html.index("<!-- NEWSLETTER_ARTICLES:START -->")
          end = html.index("<!-- NEWSLETTER_ARTICLES:END -->", start)
          block = html[start:end]

          count = block.count("<article>")
          if count < 1 or count > 4:
              raise SystemExit(f"Quantidade inesperada de artigos renderizados: {count}")

          if block.count('target="_blank"') != count:
              raise SystemExit("Nem todos os artigos possuem link externo esperado.")

          print(count)
          PY
          )"

          echo "article_count=${article_count}" >> "$GITHUB_OUTPUT"
          echo "Validated ${article_count} newsletter article(s)."
          git diff --check

          if [[ -z "$(git status --porcelain -- assets/data/newsletter-articles.json index.html)" ]]; then
            echo "Import completed without repository changes."
            exit 1
          fi

      - name: Publish automation branch and open or update PR
        id: pull_request
        shell: bash
        env:
          GH_TOKEN: ${{ secrets.AUTOMATION_PR_TOKEN || github.token }}
          GH_REPO: ${{ github.repository }}
          AUTOMATION_TOKEN_CONFIGURED: ${{ secrets.AUTOMATION_PR_TOKEN != '' }}
        run: |
          automation_branch="${AUTOMATION_BRANCH_PREFIX}-${GITHUB_RUN_ID}"
          gh auth setup-git

          remote_sha="$(
            git ls-remote --heads origin "refs/heads/${automation_branch}" \
              | awk '{print $1}'
          )"

          git switch -c "$automation_branch"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add assets/data/newsletter-articles.json index.html
          git commit -m "content: import newsletter article"

          if [[ -n "$remote_sha" ]]; then
            git push \
              --force-with-lease="refs/heads/${automation_branch}:${remote_sha}" \
              origin "HEAD:refs/heads/${automation_branch}"
          else
            git push --set-upstream origin "HEAD:refs/heads/${automation_branch}"
          fi

          cat > /tmp/newsletter-import-pr.md <<EOF
          ## Resumo

          Importa metadados de um artigo para o catálogo da newsletter e atualiza a homepage com o estado resultante.

          ## Validação

          - metadados recuperados e normalizados antes da persistência;
          - duplicidade de URL verificada;
          - catálogo limitado e ordenado pelo workflow de importação;
          - homepage renderizada por \`.github/scripts/render-newsletter.py\`;
          - bloco da newsletter validado;
          - \`git diff --check\` executado;
          - quality gates do repositório devem passar antes do merge.

          ## Origem

          Gerado por [Import newsletter article](https://github.com/${GH_REPO}/actions/runs/${GITHUB_RUN_ID}).

          > O JSON e a homepage são revisados no mesmo PR. O workflow diário de sincronização permanece como mecanismo de reconciliação.
          EOF

          pr_number="$(
            gh pr list \
              --repo "$GH_REPO" \
              --head "$automation_branch" \
              --base main \
              --state open \
              --json number \
              --jq '.[0].number // empty'
          )"

          if [[ -n "$pr_number" ]]; then
            gh pr edit "$pr_number" \
              --repo "$GH_REPO" \
              --title "content: import newsletter article" \
              --body-file /tmp/newsletter-import-pr.md
            pr_url="$(gh pr view "$pr_number" --repo "$GH_REPO" --json url --jq '.url')"
          else
            pr_url="$(
              gh pr create \
                --repo "$GH_REPO" \
                --base main \
                --head "$automation_branch" \
                --title "content: import newsletter article" \
                --body-file /tmp/newsletter-import-pr.md
            )"
            pr_number="$(gh pr view "$pr_url" --repo "$GH_REPO" --json number --jq '.number')"
          fi

          {
            echo "branch=${automation_branch}"
            echo "number=${pr_number}"
            echo "url=${pr_url}"
            echo "automation_token_configured=${AUTOMATION_TOKEN_CONFIGURED}"
          } >> "$GITHUB_OUTPUT"

      - name: Add Pull Request result to summary
        if: always()
        shell: bash
        env:
          ARTICLE_COUNT: ${{ steps.validation.outputs.article_count }}
          PR_BRANCH: ${{ steps.pull_request.outputs.branch }}
          PR_NUMBER: ${{ steps.pull_request.outputs.number }}
          PR_URL: ${{ steps.pull_request.outputs.url }}
          AUTOMATION_TOKEN_CONFIGURED: ${{ steps.pull_request.outputs.automation_token_configured }}
        run: |
          {
            echo
            echo "## Pull Request"
            echo
            echo "- **Artigos renderizados na homepage:** ${ARTICLE_COUNT:-n/a}"

            if [[ -n "$PR_URL" ]]; then
              echo "- **Branch:** \`${PR_BRANCH}\`"
              echo "- **Pull Request:** [#${PR_NUMBER}](${PR_URL})"

              if [[ "$AUTOMATION_TOKEN_CONFIGURED" == "true" ]]; then
                echo "- **Token de automação dedicado:** configurado"
              else
                echo "- **Token de automação dedicado:** não configurado; o GitHub pode exigir aprovação manual para iniciar os workflows do PR criado pelo \`GITHUB_TOKEN\`."
              fi
            else
              echo "- **Pull Request:** não criado"
            fi
          } >> "$GITHUB_STEP_SUMMARY"
'''

text = text[:index] + new_tail
path.write_text(text, encoding='utf-8')
